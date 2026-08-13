import Stripe from 'npm:stripe@20.4.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'

type Env = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
}

function getEnv(): Env {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
  const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET)
    throw new Error('Missing required environment variables')

  return { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET }
}

function toIso(seconds: number | null | undefined) {
  if (!seconds)
    return null
  return new Date(seconds * 1000).toISOString()
}

async function safeInsertNotification(
  supabase: ReturnType<typeof createClient>,
  payload: {
    user_id: string
    body: string
    link_path?: string | null
    sender_name?: string | null
    sender_email?: string | null
    sender_avatar_url?: string | null
    metadata?: Record<string, unknown>
  }
) {
  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: payload.user_id,
      type: 'system',
      body: payload.body,
      link_path: payload.link_path ?? null,
      sender_name: payload.sender_name ?? 'Kortex',
      sender_email: payload.sender_email ?? null,
      sender_avatar_url: payload.sender_avatar_url ?? null,
      metadata: payload.metadata ?? {}
    })

  if (error) {
    console.error('[stripe-webhook] failed to insert notification', {
      user_id: payload.user_id,
      error: error.message
    })
  }
}

Deno.serve(async (req) => {
  try {
    const env = getEnv()
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
      cryptoProvider: Stripe.createSubtleCryptoProvider()
    })
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

    const signature = req.headers.get('stripe-signature')
    if (!signature)
      return new Response('Missing stripe-signature', { status: 400 })

    const payload = await req.text()
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET)
    } catch {
      return new Response('Invalid signature', { status: 400 })
    }

    const upsertSubscription = async (subscription: Stripe.Subscription, supabaseUserId: string | null) => {
      const stripeCustomerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id

      let userId = supabaseUserId || (subscription.metadata?.supabase_user_id ?? null)

      if (!userId && stripeCustomerId) {
        const { data } = await supabase
          .from('stripe_customers')
          .select('user_id')
          .eq('stripe_customer_id', stripeCustomerId)
          .maybeSingle<{ user_id: string }>()

        userId = data?.user_id ?? null
      }

      if (!userId)
        return

      if (stripeCustomerId) {
        await supabase
          .from('stripe_customers')
          .upsert({ user_id: userId, stripe_customer_id: stripeCustomerId }, { onConflict: 'user_id' })
      }

      const item = subscription.items.data?.[0]

      await supabase
        .from('stripe_subscriptions')
        .upsert({
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          price_id: item?.price?.id ?? null,
          quantity: item?.quantity ?? null,
          cancel_at_period_end: subscription.cancel_at_period_end ?? false,
          current_period_start: toIso(subscription.current_period_start),
          current_period_end: toIso(subscription.current_period_end),
          canceled_at: toIso(subscription.canceled_at),
          metadata: subscription.metadata ?? {}
        }, { onConflict: 'stripe_subscription_id' })
    }

    const upsertInvoice = async (invoice: Stripe.Invoice) => {
      const stripeCustomerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id

      if (!stripeCustomerId)
        return

      const { data: customerRow } = await supabase
        .from('stripe_customers')
        .select('user_id')
        .eq('stripe_customer_id', stripeCustomerId)
        .maybeSingle<{ user_id: string }>()

      const userId = customerRow?.user_id
      if (!userId)
        return

      const stripeSubscriptionId = typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id

      const line = invoice.lines?.data?.[0]
      const periodStart = line?.period?.start
      const periodEnd = line?.period?.end

      await supabase
        .from('stripe_invoices')
        .upsert({
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId ?? null,
          stripe_invoice_id: invoice.id,
          status: invoice.status ?? null,
          currency: invoice.currency ?? null,
          total: invoice.total ?? null,
          amount_due: invoice.amount_due ?? null,
          amount_paid: invoice.amount_paid ?? null,
          amount_remaining: invoice.amount_remaining ?? null,
          invoice_number: invoice.number ?? null,
          hosted_invoice_url: invoice.hosted_invoice_url ?? null,
          invoice_pdf: invoice.invoice_pdf ?? null,
          collection_method: invoice.collection_method ?? null,
          due_date: toIso(invoice.due_date),
          period_start: toIso(periodStart),
          period_end: toIso(periodEnd),
          paid: invoice.paid ?? null,
          created: toIso(invoice.created),
          data: invoice as unknown as Record<string, unknown>
        }, { onConflict: 'stripe_invoice_id' })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
      const supabaseUserId = (session.client_reference_id || (session.metadata?.supabase_user_id ?? null)) as string | null

      if (supabaseUserId && customerId) {
        await supabase
          .from('stripe_customers')
          .upsert({ user_id: supabaseUserId, stripe_customer_id: customerId }, { onConflict: 'user_id' })
      }

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        await upsertSubscription(subscription, supabaseUserId)

        if (supabaseUserId) {
          await safeInsertNotification(supabase, {
            user_id: supabaseUserId,
            body: 'Assinatura iniciada com sucesso.',
            link_path: '/app/settings/subscription',
            metadata: {
              stripe_subscription_id: subscription.id,
              stripe_customer_id: customerId
            }
          })
        }
      }
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription
      await upsertSubscription(subscription, null)

      const stripeCustomerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id

      if (stripeCustomerId) {
        const { data } = await supabase
          .from('stripe_customers')
          .select('user_id')
          .eq('stripe_customer_id', stripeCustomerId)
          .maybeSingle<{ user_id: string }>()

        const userId = data?.user_id
        if (userId) {
          if (event.type === 'customer.subscription.deleted') {
            await safeInsertNotification(supabase, {
              user_id: userId,
              body: 'Sua assinatura foi cancelada.',
              link_path: '/app/settings/subscription',
              metadata: { stripe_subscription_id: subscription.id }
            })
          }

          if (event.type === 'customer.subscription.updated' && subscription.cancel_at_period_end) {
            await safeInsertNotification(supabase, {
              user_id: userId,
              body: 'Cancelamento da assinatura agendado para o fim do período.',
              link_path: '/app/settings/subscription',
              metadata: { stripe_subscription_id: subscription.id }
            })
          }
        }
      }
    }

    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice
      await upsertInvoice(invoice)

      const stripeCustomerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id

      if (stripeCustomerId) {
        const { data: customerRow } = await supabase
          .from('stripe_customers')
          .select('user_id')
          .eq('stripe_customer_id', stripeCustomerId)
          .maybeSingle<{ user_id: string }>()

        const userId = customerRow?.user_id
        if (userId) {
          await safeInsertNotification(supabase, {
            user_id: userId,
            body: event.type === 'invoice.paid'
              ? 'Pagamento confirmado. Sua fatura está disponível.'
              : 'Falha no pagamento. Atualize sua forma de pagamento.',
            link_path: '/app/settings/subscription',
            metadata: {
              stripe_invoice_id: invoice.id,
              stripe_subscription_id: typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
            }
          })
        }
      }

      const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        await upsertSubscription(subscription, null)
      }
    }

    if (event.type.startsWith('invoice.') && event.type !== 'invoice.paid' && event.type !== 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice
      await upsertInvoice(invoice)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'content-type': 'application/json' }
    })
  } catch {
    return new Response('Internal error', { status: 500 })
  }
})
