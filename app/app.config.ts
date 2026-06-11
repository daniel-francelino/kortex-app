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
