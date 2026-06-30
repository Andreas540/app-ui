import BiznizCollectibles from './BiznizCollectibles'

export default function FrontPageBiznizBlue({ onContinue }: { onContinue: () => void }) {
  return <BiznizCollectibles accent="#3d6e74" onContinue={onContinue} />
}
