<template>
  <div class="blog-area">
    <NuxtPage />
  </div>
</template>

<style scoped>
.blog-area { padding-bottom: 80px; overflow-wrap: anywhere; }
.blog-area :deep(.blog-hero) { padding: 88px 0 48px; }
.blog-area :deep(.blog-eyebrow) { font-size: 11px; font-weight: 600; letter-spacing: .13em; color: var(--ui-text-muted); }
.blog-area :deep(h1) { margin-top: 24px; max-width: 920px; font-size: clamp(2.5rem, 5.5vw, 4.5rem); font-weight: 650; line-height: 1.1; letter-spacing: -.05em; text-wrap: balance; color: var(--ui-text-highlighted); }
.blog-area :deep(h1 > span) { color: var(--ui-primary); }
.blog-area :deep(.blog-lead) { max-width: 650px; margin-top: 24px; font-size: 17px; line-height: 1.8; color: var(--ui-text-muted); }
.blog-area :deep(.blog-toolbar) { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px 0; border-block: 1px solid var(--ui-border); }
.blog-area :deep(.blog-filters) { display: flex; flex-wrap: wrap; gap: 6px; }
.blog-area :deep(.blog-filters button) { min-height: 44px; padding: 8px 14px; border: 1px solid transparent; border-radius: 8px; font-size: 12px; color: var(--ui-text-muted); cursor: pointer; }
.blog-area :deep(.blog-filters button[aria-pressed="true"]) { background: color-mix(in srgb, var(--ui-primary) 9%, transparent); border-color: color-mix(in srgb, var(--ui-primary) 25%, transparent); color: var(--ui-text-highlighted); }
.blog-area :deep(.blog-search) { width: 250px; flex-shrink: 0; }
.blog-area :deep(.blog-grid) { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; margin-top: 32px; }
.blog-area :deep(.blog-card) { border: 1px solid var(--ui-border); border-radius: 18px; transition: border-color 180ms; }
.blog-area :deep(.blog-card:hover) { border-color: color-mix(in srgb, var(--ui-primary) 45%, var(--ui-border)); }
.blog-area :deep(.blog-card-featured) { grid-column: 1 / -1; background: color-mix(in srgb, var(--ui-primary) 6%, var(--ui-bg)); }
.blog-area :deep(.blog-card-wide) { grid-column: span 2; }
.blog-area :deep(.blog-card-link) { display: flex; height: 100%; flex-direction: column; gap: 24px; padding: 28px; border-radius: inherit; }
.blog-area :deep(.blog-card-link:focus-visible) { outline: 2px solid var(--ui-primary); outline-offset: 4px; }
.blog-area :deep(.blog-card-meta) { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; font-size: 11px; color: var(--ui-text-muted); }
.blog-area :deep(.blog-tag) { padding: 5px 9px; border-radius: 5px; background: color-mix(in srgb, var(--ui-primary) 9%, transparent); color: var(--ui-text-highlighted); }
.blog-area :deep(.blog-card h2), .blog-area :deep(.blog-card h3) { font-size: 23px; line-height: 1.3; letter-spacing: -.03em; color: var(--ui-text-highlighted); font-weight: 600; }
.blog-area :deep(.blog-card-featured h2) { max-width: 580px; font-size: clamp(1.8rem, 3vw, 2.6rem); }
.blog-area :deep(.blog-card-description) { margin-top: 14px; font-size: 14px; line-height: 1.8; color: var(--ui-text-muted); }
.blog-area :deep(.blog-card-bottom) { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 24px; font-size: 12px; color: var(--ui-text-highlighted); }
.blog-area :deep(.blog-callout) { display: flex; align-items: center; justify-content: space-between; gap: 28px; padding: 36px; margin-top: 64px; border: 1px solid var(--ui-border); border-radius: 20px; }
.blog-area :deep(.blog-callout h2), .blog-area :deep(.article-action h2), .blog-area :deep(.related-section > h2) { margin-top: 16px; font-size: 28px; line-height: 1.25; letter-spacing: -.035em; font-weight: 600; color: var(--ui-text-highlighted); }
.blog-area :deep(.blog-callout p:last-child), .blog-area :deep(.article-action > p:not(:first-child)) { margin-top: 14px; font-size: 14px; line-height: 1.8; color: var(--ui-text-muted); }
.blog-area :deep(.blog-callout > a) { flex-shrink: 0; }
.blog-area :deep(.blog-empty) { text-align: center; padding: 60px 20px; color: var(--ui-text-muted); }
.blog-area :deep(.blog-empty h2) { font-size: 22px; color: var(--ui-text-highlighted); margin-bottom: 14px; }
.blog-area :deep(.blog-back) { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; margin-top: 36px; font-size: 13px; color: var(--ui-text-muted); }
.blog-area :deep(.article-header) { padding: 36px 0 40px; border-bottom: 1px solid var(--ui-border); }
.blog-area :deep(.article-header h1) { max-width: 850px; font-size: clamp(2.3rem, 4.7vw, 3.8rem); }
.blog-area :deep(.article-dates) { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-top: 24px; font-size: 11px; color: var(--ui-text-muted); }
.blog-area :deep(.article-layout) { display: grid; grid-template-columns: minmax(0, 740px) 240px; gap: 64px; justify-content: space-between; padding-top: 40px; }
.blog-area :deep(.article-prose) { font-size: 17px; line-height: 1.9; color: var(--ui-text-muted); }
.blog-area :deep(.article-prose p), .blog-area :deep(.article-prose ul), .blog-area :deep(.article-prose ol) { margin-block: 24px; line-height: inherit; font-size: inherit; }
.blog-area :deep(.article-prose h2) { margin-block: 40px 20px; font-size: 26px; font-weight: 600; line-height: 1.3; letter-spacing: -.03em; color: var(--ui-text-highlighted); scroll-margin-top: 100px; }
.blog-area :deep(.article-prose strong) { font-weight: 600; color: var(--ui-text-highlighted); }
.blog-area :deep(.article-toc) { align-self: start; position: sticky; top: 90px; }
.blog-area :deep(.article-action) { padding: 28px; margin-top: 40px; border: 1px solid color-mix(in srgb, var(--ui-primary) 25%, var(--ui-border)); border-radius: 18px; background: color-mix(in srgb, var(--ui-primary) 5%, var(--ui-bg)); }
.blog-area :deep(.related-section) { margin-top: 72px; padding-top: 40px; border-top: 1px solid var(--ui-border); }
.blog-area :deep(.related-grid) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 28px; }
@media (max-width: 1023px) { .blog-area :deep(.blog-grid) { grid-template-columns: repeat(2, minmax(0, 1fr)); } .blog-area :deep(.article-layout) { grid-template-columns: minmax(0, 1fr); } .blog-area :deep(.article-toc) { display: none; } .blog-area :deep(.blog-toolbar) { align-items: stretch; flex-direction: column; } .blog-area :deep(.blog-search) { width: 100%; } }
@media (max-width: 639px) { .blog-area :deep(.blog-hero) { padding-top: 56px; } .blog-area :deep(.blog-grid), .blog-area :deep(.related-grid) { grid-template-columns: minmax(0, 1fr); } .blog-area :deep(.blog-card-featured) { grid-column: auto; } .blog-area :deep(.blog-card-link) { padding: 24px; } .blog-area :deep(.blog-callout) { align-items: stretch; flex-direction: column; padding: 24px; } .blog-area :deep(.article-prose) { font-size: 16px; } }
@media (max-width: 639px) { .blog-area :deep(.blog-card-wide) { grid-column: auto; } }
@media (prefers-reduced-motion: reduce) { .blog-area :deep(.blog-card) { transition: none; transform: none !important; } }
</style>
