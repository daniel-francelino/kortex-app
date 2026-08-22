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
        body: 'max-lg:pb-[calc(var(--mobile-bottom-nav-height,4.75rem)+var(--safe-area-bottom,0px)+1rem)]'
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
        content: 'max-h-[90vh] flex flex-col',
        body: 'overflow-y-auto'
      }
    }
  }
})
