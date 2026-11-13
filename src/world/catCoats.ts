export type CatCoatId =
  | 'cheese'
  | 'calico'
  | 'tuxedo'
  | 'mackerel'
  | 'black'
  | 'creamsicle';

export interface CatCoatDefinition {
  id: CatCoatId;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  eyeColor: string;
  noseColor: string;
  earInnerColor: string;
  pattern: 'tabby' | 'calico' | 'tuxedo' | 'solid' | 'cream';
  swatchGradient: string;
}

export const CAT_COATS: readonly CatCoatDefinition[] = [
  {
    id: 'cheese',
    name: '치즈태비',
    primaryColor: '#e69c45',
    secondaryColor: '#f5e6d3',
    accentColor: '#c97824',
    eyeColor: '#5c8a3c',
    noseColor: '#e89592',
    earInnerColor: '#f0b8ae',
    pattern: 'tabby',
    swatchGradient: 'linear-gradient(135deg, #e69c45 58%, #f5e6d3 58%)',
  },
  {
    id: 'calico',
    name: '삼색이',
    primaryColor: '#f4f1ea',
    secondaryColor: '#d97925',
    accentColor: '#33312e',
    eyeColor: '#b58932',
    noseColor: '#e89898',
    earInnerColor: '#f0b6ae',
    pattern: 'calico',
    swatchGradient:
      'linear-gradient(135deg, #f4f1ea 36%, #d97925 36% 70%, #33312e 70%)',
  },
  {
    id: 'tuxedo',
    name: '턱시도',
    primaryColor: '#262628',
    secondaryColor: '#f5f5f7',
    accentColor: '#38383d',
    eyeColor: '#7bb55b',
    noseColor: '#3f3b3e',
    earInnerColor: '#c79b98',
    pattern: 'tuxedo',
    swatchGradient: 'linear-gradient(135deg, #262628 60%, #f5f5f7 60%)',
  },
  {
    id: 'mackerel',
    name: '고등어태비',
    primaryColor: '#7d8085',
    secondaryColor: '#3d4045',
    accentColor: '#d9dce0',
    eyeColor: '#72a361',
    noseColor: '#a87878',
    earInnerColor: '#d9aeb0',
    pattern: 'tabby',
    swatchGradient: 'linear-gradient(135deg, #7d8085 55%, #3d4045 55%)',
  },
  {
    id: 'black',
    name: '깜장이',
    primaryColor: '#222326',
    secondaryColor: '#2e3036',
    accentColor: '#191a1d',
    eyeColor: '#f2c94c',
    noseColor: '#2d2b30',
    earInnerColor: '#786366',
    pattern: 'solid',
    swatchGradient: 'radial-gradient(circle at 65% 38%, #f2c94c 16%, #222326 22%)',
  },
  {
    id: 'creamsicle',
    name: '크림시클',
    primaryColor: '#f3dfc1',
    secondaryColor: '#faf3e8',
    accentColor: '#dfb886',
    eyeColor: '#5c93b5',
    noseColor: '#eba29e',
    earInnerColor: '#f5c4bc',
    pattern: 'cream',
    swatchGradient: 'linear-gradient(135deg, #f3dfc1 60%, #dfb886 60%)',
  },
] as const;

export function getCatCoatById(id: CatCoatId): CatCoatDefinition {
  return CAT_COATS.find((coat) => coat.id === id) ?? CAT_COATS[0];
}
