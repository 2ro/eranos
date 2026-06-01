import { forwardRef, useState, type ButtonHTMLAttributes, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import AuthDialog from '@/components/auth/AuthDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';

type StartCampaignLinkProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  to?: string;
};

export const StartCampaignLink = forwardRef<HTMLButtonElement, StartCampaignLinkProps>(function StartCampaignLink(
  { onClick, to = '/campaigns/new', type = 'button', ...props },
  ref,
) {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;

    if (user) {
      navigate(to);
    } else {
      setAuthOpen(true);
    }
  };

  return (
    <>
      <button ref={ref} type={type} onClick={handleClick} {...props} />
      <AuthDialog isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
});
