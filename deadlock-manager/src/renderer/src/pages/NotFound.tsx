import { Link } from 'react-router'
import { buttonVariants } from '@/components/ui/button'
import { useI18n } from '@/hooks/useI18n'

export default function NotFound(): React.JSX.Element {
  const { t } = useI18n()

  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
      <p className="text-muted-foreground">{t('notFound.text')}</p>
      <Link to="/" className={buttonVariants({ variant: 'outline' })}>
        {t('notFound.back')}
      </Link>
    </div>
  )
}
