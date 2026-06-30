import BiznizCollectibles from './BiznizCollectibles'

export default function FrontPageBiznizGreen({ onContinue }: { onContinue: () => void }) {
  return <BiznizCollectibles accent="#7d895a" onContinue={onContinue} />
}
