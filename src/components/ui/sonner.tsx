import type { ComponentProps } from "react";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = ComponentProps<typeof Sonner>;

/** Set on `document.documentElement` by `JudgeRequestToastHost` (px). Avoids nested `calc()` + React context. */
const BOTTOM_OFFSET = `calc(5rem + env(safe-area-inset-bottom, 0px) + var(--oweit-judge-stack-inset, 0px))`;

/** Match `JudgeRequestToastHost` (`right-4`). Sonner defaults `right` to 24px when only `bottom` is set. */
const HORIZONTAL_INSET = "1rem";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      position="bottom-right"
      /** Always expanded: vertical list with gap — no stacked/overlapping cards; newest stays lowest (Sonner default for bottom). */
      expand
      gap={16}
      visibleToasts={10}
      offset={{ bottom: BOTTOM_OFFSET, right: HORIZONTAL_INSET }}
      mobileOffset={{ bottom: BOTTOM_OFFSET, right: HORIZONTAL_INSET }}
      toastOptions={{
        /** Match `JudgeGoalCreatedNoticeHost` dismiss control (rounded square, muted, hover). */
        closeButtonAriaLabel: "Dismiss notification",
        classNames: {
          /** Same row as `JudgeGoalCreatedNoticeHost`: icon | text | dismiss (not absolute top corner). */
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg !flex !flex-row !items-start !gap-3",
          icon: "shrink-0",
          content: "min-w-0 flex-1 text-left",
          description: "group-[.toast]:text-white",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton:
            "order-last shrink-0 self-start !h-8 !w-8 !rounded-lg !border-0 !bg-transparent !shadow-none p-1.5 text-muted-foreground transition-colors hover:!bg-muted hover:!text-foreground [&>svg]:!h-5 [&>svg]:!w-5",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
