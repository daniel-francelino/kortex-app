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
    dashboardPanel: {
      slots: {
        root: 'max-lg:min-h-0',
      }
    },
    popover: {
      slots: {
        content: 'z-[320]'
      }
    },
    // `item`/`itemLeadingIcon` here are the dropdown OPTIONS (the popup list
    // that opens on tap), not the closed select field itself — those default
    // to `p-1.5 text-sm` (~28px rows) even at size="md", well under the
    // ~44px touch target every option should have on mobile. Applies to
    // every USelect/USelectMenu/UInputMenu app-wide, not just one modal.
    select: {
      slots: {
        content: 'z-[320]',
        item: 'max-lg:p-3 max-lg:text-base max-lg:gap-3',
        itemLeadingIcon: 'max-lg:size-6'
      }
    },
    selectMenu: {
      slots: {
        content: 'z-[320]',
        item: 'max-lg:p-3 max-lg:text-base max-lg:gap-3',
        itemLeadingIcon: 'max-lg:size-6'
      }
    },
    inputMenu: {
      slots: {
        content: 'z-[320]',
        item: 'max-lg:p-3 max-lg:text-base max-lg:gap-3',
        itemLeadingIcon: 'max-lg:size-6'
      }
    },
    modal: {
      slots: {
        overlay: 'max-lg:p-[max(1rem,var(--safe-area-top))_1rem_max(1rem,var(--safe-area-bottom))]',
        content: 'max-h-[90vh] flex flex-col max-lg:max-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-2rem)]',
        body: 'overflow-y-auto',
        footer: 'max-lg:pb-[max(1rem,var(--safe-area-bottom))]'
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
