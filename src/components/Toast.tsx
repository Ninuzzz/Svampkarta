import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { CheckCircle } from '@phosphor-icons/react'

interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})

export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<number>(undefined)

  const show = useCallback((t: Omit<Toast, 'id'>) => {
    window.clearTimeout(timer.current)
    setToast({ ...t, id: Date.now() })
    timer.current = window.setTimeout(() => setToast(null), t.action ? 6000 : 3500)
  }, [])

  return (
    <Ctx.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[1200] flex justify-center px-4 lg:bottom-8"
      >
        {toast && (
          <div key={toast.id} className="glass-strong rise pointer-events-auto flex items-center gap-3 !rounded-full py-2 pr-2 pl-4 text-sm font-medium">
            <CheckCircle size={20} weight="fill" className="text-forest-600" aria-hidden="true" />
            <span>{toast.text}</span>
            {toast.action ? (
              <button
                type="button"
                className="btn btn-ghost !min-h-9 !px-3"
                onClick={() => {
                  toast.action!.run()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            ) : (
              <span className="w-2" />
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  )
}
