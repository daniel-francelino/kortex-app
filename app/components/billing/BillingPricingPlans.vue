<script setup lang="ts">
import { useAuth } from "~/composables/useAuth";
import { PostHogEvent } from "~/types/analytics";
import { motion } from "motion-v";

type PricingPage = {
  title: string;
  description: string;
  plans: PricingPlan[];
};

type PricingPlan = {
  title: string;
  description: string;
  features: string[];
  highlight?: boolean;
  button?: Record<string, unknown>;
  price?: {
    month?: string;
  };
  stripePriceId?: {
    month?: string;
  };
} & Record<string, unknown>;

type FetchErrorLike = {
  data?: {
    statusMessage?: string;
  };
  statusMessage?: string;
};

const props = withDefaults(
  defineProps<{
    page: PricingPage;
    cancelPath?: string;
    successPath?: string;
    embedded?: boolean;
  }>(),
  {
    embedded: false,
  },
);

const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

const toast = useToast();
const auth = useAuth();
const { capture } = usePostHog();

async function startCheckout(priceId: string) {
  await auth.ensureReady();

  if (!auth.isAuthenticated.value) {
    capture(PostHogEvent.PricingLoginRedirected, {
      price_id: priceId,
    });
    await navigateTo("/login");
    return;
  }

  try {
    capture(PostHogEvent.PricingCheckoutStarted, {
      billing_interval: "monthly",
      price_id: priceId,
    });
    const { url } = await $fetch<{ url: string }>("/api/billing/checkout", {
      method: "POST",
      body: {
        priceId,
        successPath: props.successPath ?? undefined,
        cancelPath: props.cancelPath ?? undefined,
      },
    });

    await navigateTo(url, { external: true });
  } catch (error: unknown) {
    const err = error as FetchErrorLike;
    const message =
      err?.data?.statusMessage ||
      err?.statusMessage ||
      "Não foi possível iniciar o checkout";
    toast.add({ title: "Erro", description: message, color: "error" });
  }
}

const plansWithActions = computed(() => {
  const plans = props.page?.plans || [];

  return plans.map((plan) => {
    const priceId = plan.stripePriceId?.month;
    if (!priceId)
      return props.embedded
        ? plan
        : { ...plan, button: { ...plan.button, to: "/signup" } };

    return {
      ...plan,
      button: {
        ...(plan.button || {}),
        to: undefined,
        onClick: () => startCheckout(priceId),
      },
    };
  });
});
</script>

<template>
  <div>
    <UContainer v-if="!props.embedded">
      <section class="pricing-intro" aria-labelledby="pricing-title">
        <p class="pricing-eyebrow">PLANOS / UM ESPAÇO PARA CADA FASE</p>
        <h1 id="pricing-title">{{ props.page.title }}</h1>
        <p class="pricing-description">{{ props.page.description }}</p>
        <p class="billing-note">
          Assinaturas mensais. Escolha o espaço que faz sentido para você.
        </p>
      </section>
    </UContainer>

    <div v-else class="space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-1">
          <h2 class="text-lg font-semibold text-highlighted">
            {{ props.page.title }}
          </h2>
          <p class="text-sm text-muted">
            {{ props.page.description }}
          </p>
        </div>
      </div>
    </div>

    <UContainer v-if="!props.embedded">
      <div class="plan-grid">
        <motion.article
          v-for="(plan, index) in plansWithActions"
          :key="plan.title"
          class="plan-card"
          :class="{ 'plan-highlight': plan.highlight }"
          :initial="{ y: reducedMotion ? 0 : 14 }"
          :animate="{ y: 0 }"
          :transition="{
            duration: 0.4,
            delay: reducedMotion ? 0 : index * 0.08,
          }"
        >
          <div class="plan-heading">
            <h2>{{ plan.title }}</h2>
            <span v-if="plan.highlight" class="plan-badge"
              >Para compartilhar</span
            >
          </div>
          <p class="plan-description">{{ plan.description }}</p>
          <div class="plan-price">
            <strong>{{ plan.price?.month }}</strong
            ><span>/mês</span>
          </div>
          <p class="plan-billing">Cobrança mensal por plano.</p>
          <UButton
            v-bind="plan.button"
            :color="plan.highlight ? 'primary' : 'neutral'"
            :variant="plan.highlight ? 'solid' : 'outline'"
            size="xl"
            block
            class="min-h-12 justify-center rounded-xl"
          />
          <ul class="plan-features">
            <li v-for="feature in plan.features" :key="feature">
              <UIcon name="i-lucide-check" aria-hidden="true" />{{ feature }}
            </li>
          </ul>
        </motion.article>
      </div>
      <p class="pricing-footnote">
        <UIcon name="i-lucide-arrow-left-right" /> Pessoal, Duo ou Família.
        Escolha quantas contas você precisa.
      </p>
    </UContainer>

    <UPricingPlans v-else scale>
      <UPricingPlan
        v-for="(plan, index) in plansWithActions"
        :key="index"
        v-bind="plan"
        :price="plan.price?.month"
        billing-cycle="/mês"
      />
    </UPricingPlans>
  </div>
</template>

<style scoped>
.pricing-intro {
  padding: 88px 0 48px;
  text-align: center;
}
.pricing-eyebrow {
  color: var(--ui-primary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
}
.pricing-intro h1 {
  max-width: 800px;
  margin: 24px auto 0;
  font-size: clamp(2.5rem, 5.5vw, 4.5rem);
  font-weight: 650;
  line-height: 1.08;
  letter-spacing: -0.055em;
  text-wrap: balance;
  color: var(--ui-text-highlighted);
}
.pricing-description {
  max-width: 580px;
  margin: 24px auto 0;
  font-size: 17px;
  line-height: 1.8;
  color: var(--ui-text-muted);
}
.billing-note {
  margin-top: 14px;
  min-height: 36px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.plan-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}
.plan-card {
  padding: 30px;
  border: 1px solid var(--ui-border);
  border-radius: 20px;
  background: var(--ui-bg);
}
.plan-highlight {
  border-color: var(--ui-primary);
  background: color-mix(in srgb, var(--ui-primary) 5%, var(--ui-bg));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ui-primary) 6%, transparent);
}
.plan-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 30px;
}
.plan-heading h2 {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--ui-text-highlighted);
}
.plan-badge {
  padding: 4px 8px;
  font-size: 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-primary) 12%, transparent);
  color: var(--ui-text-highlighted);
}
.plan-description {
  margin-top: 12px;
  min-height: 72px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--ui-text-muted);
}
.plan-price {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 28px;
}
.plan-price strong {
  font-size: clamp(2.2rem, 3.8vw, 3rem);
  line-height: 1.2;
  letter-spacing: -0.055em;
  color: var(--ui-text-highlighted);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.plan-price > span {
  font-size: 14px;
  color: var(--ui-text-muted);
}
.plan-billing {
  min-height: 52px;
  margin: 12px 0 16px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ui-text-muted);
}
.plan-features {
  display: grid;
  gap: 16px;
  margin-top: 28px;
  padding-top: 28px;
  border-top: 1px solid var(--ui-border);
}
.plan-features li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--ui-text-muted);
}
.plan-features li > span {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 3px;
  color: var(--ui-primary);
}
.pricing-footnote {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 26px;
  text-align: center;
  font-size: 12px;
  color: var(--ui-text-muted);
}
@media (max-width: 1023px) {
  .plan-card {
    padding: 24px;
  }
  .plan-heading {
    align-items: flex-start;
    flex-direction: column;
    min-height: 60px;
  }
}
@media (max-width: 767px) {
  .pricing-intro {
    padding-top: 56px;
  }
  .plan-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }
  .plan-heading {
    flex-direction: row;
    align-items: center;
    min-height: 30px;
  }
  .plan-description {
    min-height: 0;
  }
  .plan-billing {
    min-height: 40px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .plan-card {
    transform: none !important;
  }
}
</style>
