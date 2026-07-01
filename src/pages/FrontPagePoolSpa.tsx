import PoolAndSpa from './PoolAndSpa'

export default function FrontPagePoolSpa({ onContinue }: { onContinue: () => void }) {
  return <PoolAndSpa onContinue={onContinue} />
}
