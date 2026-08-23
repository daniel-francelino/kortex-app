export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'zinc'
    },
    dashboardNavbar: {
      slots: {
        root: 'h-12 shrink-0 flex items-center justify-between border-b border-default px-4 sm:px-6 gap-1.5'
      }
    },
    // DashboardPanel's own body is what actually scrolls (`flex-1 overflow-y-auto`
    // in its default theme) — the `.app-content-with-bottom-nav` padding-bottom
    // in main.css sits on a non-scrolling ancestor and never reaches this element,
    // so the last bit of content on every mobile page stayed hidden and
    // unclickable behind the fixed MobileBottomNav. Extending the padding here,
    // on the element that actually scrolls, is what makes it effective.
    dashboardPanel: {
      slots: {
        body: 'max-lg:pb-[calc(var(--mobile-bottom-nav-height,4.75rem)+1rem)]'
      }
    },
    popover: {
      slots: {
        content: 'z-[320]'
      }
    },
    select: {
      slots: {
        content: 'z-[320]'
      }
    },
    selectMenu: {
      slots: {
        content: 'z-[320]'
      }
    },
    inputMenu: {
      slots: {
        content: 'z-[320]'
      }
    },
    modal: {
      slots: {
        overlay: 'max-lg:p-[max(1rem,var(--safe-area-top))_1rem_max(1rem,var(--safe-area-bottom))]',
        content: 'max-h-[90vh] flex flex-col max-lg:max-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-2rem)]',
        header: 'max-lg:pt-[max(1rem,var(--safe-area-top))]',
        body: 'overflow-y-auto',
        footer: 'max-lg:pb-[max(1rem,var(--safe-area-bottom))]',
        close: 'max-lg:top-[max(1rem,var(--safe-area-top))]'
      }
    },
    slideover: {
      slots: {
        content: 'max-lg:max-h-dvh max-lg:pt-[var(--safe-area-top)] max-lg:pb-[var(--safe-area-bottom)]',
        header: 'max-lg:min-h-[calc(var(--ui-header-height)+var(--safe-area-top))] max-lg:items-end max-lg:pt-[var(--safe-area-top)]',
        footer: 'max-lg:pb-[max(1rem,var(--safe-area-bottom))]',
        close: 'max-lg:top-[max(1rem,var(--safe-area-top))]'
      }
    },
    drawer: {
      slots: {
        content: 'max-lg:max-h-dvh',
        container: 'max-lg:pt-[max(1rem,var(--safe-area-top))] max-lg:pb-[max(1rem,var(--safe-area-bottom))]'
      }
    }
  }
})
