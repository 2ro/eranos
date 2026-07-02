import React from 'react';

import { LogoIcon } from './LogoIcon';

/**
 * Legacy name for the big brand mark used on hero/onboarding/auth screens.
 * Now renders the Eranos phoenix in fixed brand yellow (it's a logo mark,
 * not a monochrome icon). Pass `className` to size it (e.g. `size-16`).
 */
export const AgoraBoltIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  (props, ref) => <LogoIcon ref={ref} aria-hidden="true" color="#fcd414" {...props} />,
);

AgoraBoltIcon.displayName = 'AgoraBoltIcon';
