import type { Toast } from "./useToasts";

/** Short messages at the bottom right (see useToasts). */
export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none absolute right-4 bottom-20 z-40 flex flex-col items-end gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`lv-toast lv-popover pointer-events-auto flex items-center gap-3 px-3.5 py-2.5 text-[0.8125rem] ${
            t.tone === "error" ? "text-[var(--lv-danger)]" : ""
          }`}
        >
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="lv-btn lv-btn-ghost lv-btn-sm"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
