import Image from 'next/image';
import emblem from '@/assets/ninja-emblem.png';

// The TalkNinja emblem (the ninja in a shuriken badge, from color-belt-lingo): the nav bar's logo and the Friend's avatar on the
// home page. Decorative: the name beside it says what it is.
export default function NinjaSymbol() {
  return (
    <span className="ninja-symbol" aria-hidden="true">
      <Image src={emblem} alt="" sizes="38px" />
    </span>
  );
}
