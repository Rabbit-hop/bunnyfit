import type { ReactNode, Ref } from 'react'

type ErrorNoticeProps = {
  children: ReactNode
  ref?: Ref<HTMLDivElement>
}

export function ErrorNotice({ children, ref }: ErrorNoticeProps) {
  return (
    <div className="error-notice" role="alert" data-testid="error-notice" tabIndex={-1} ref={ref}>
      {children}
    </div>
  )
}
