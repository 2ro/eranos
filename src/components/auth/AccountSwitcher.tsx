// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, Bell, ChevronDown, LayoutDashboard, LogOut, MessageSquare, Search, Settings, UserIcon, UserPlus } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useAuthor } from '@/hooks/useAuthor';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { genUserName } from '@/lib/genUserName';

interface AccountSwitcherProps {
  onAddAccountClick: () => void;
}

export function AccountSwitcher({ onAddAccountClick }: AccountSwitcherProps) {
  const { t } = useTranslation();
  const { currentUser, otherUsers, isLoading, setLogin, removeLogin } = useLoggedInAccounts();
  const { orderedItems } = useFeedSettings();
  const [isOpen, setIsOpen] = useState(false);

  // Fall back to useAuthor (IndexedDB-cached, longer-running query) when the
  // useLoggedInAccounts query hasn't returned kind-0 metadata yet. Without this,
  // a slow/empty relay response leaves currentUser.metadata as {} and the avatar
  // shows the "A" / "Anonymous" fallback even though the user is logged in.
  const authorFallback = useAuthor(currentUser?.pubkey);
  const currentMetadata = {
    ...(authorFallback.data?.metadata ?? {}),
    ...(currentUser?.metadata ?? {}),
  };

  if (!currentUser) return null;

  const handleLogout = () => {
    // Close the dropdown first to avoid React error #300
    setIsOpen(false);
    // Use setTimeout to ensure the dropdown closes before removing login
    setTimeout(() => {
      removeLogin(currentUser.id);
    }, 0);
  };

  const getDisplayName = (account: Account): string => {
    return account.metadata.name || account.metadata.display_name || genUserName(account.pubkey);
  }

  const currentDisplayName =
    currentMetadata.name || currentMetadata.display_name || genUserName(currentUser.pubkey);
  const currentPicture = currentMetadata.picture;

  return (
    <DropdownMenu modal={false} open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button className='group flex items-center gap-2 h-10 p-1 pr-2.5 rounded-full hover:bg-accent transition-all text-foreground'>
          {isLoading ? (
            <Skeleton className='w-8 h-8 rounded-full shrink-0' />
          ) : (
            <Avatar className='w-8 h-8'>
              <AvatarImage src={currentPicture} alt={currentDisplayName} />
              <AvatarFallback>{currentDisplayName.charAt(0)}</AvatarFallback>
            </Avatar>
          )}
          <ChevronDown className='w-4 h-4 text-muted-foreground motion-safe:transition-colors group-hover:text-foreground' />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56 p-2 animate-scale-in'>
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to={`/${nip19.npubEncode(currentUser.pubkey)}`}>
            <Avatar className='w-8 h-8'>
              <AvatarImage src={currentPicture} alt={currentDisplayName} />
              <AvatarFallback>{currentDisplayName?.charAt(0) || <UserIcon />}</AvatarFallback>
            </Avatar>
            <div className='flex-1 truncate'>
              <p className='text-sm font-medium'>{currentDisplayName}</p>
            </div>
          </Link>
        </DropdownMenuItem>
        {otherUsers.map((user) => (
          <DropdownMenuItem
            key={user.id}
            onClick={() => setLogin(user.id)}
            className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
          >
            <Avatar className='w-8 h-8'>
              <AvatarImage src={user.metadata.picture} alt={getDisplayName(user)} />
              <AvatarFallback>{getDisplayName(user)?.charAt(0) || <UserIcon />}</AvatarFallback>
            </Avatar>
            <div className='flex-1 truncate'>
              <p className='text-sm font-medium'>{getDisplayName(user)}</p>
            </div>
          </DropdownMenuItem>
        ))}
        {orderedItems.includes('dashboard') && (
          <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
            <Link to="/dashboard">
              <Activity className='w-4 h-4' />
              <span>{t('nav.dashboard')}</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to="/search">
            <Search className='w-4 h-4' />
            <span>{t('nav.search')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to="/messages">
            <MessageSquare className='w-4 h-4' />
            <span>{t('nav.messages')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to="/notifications">
            <Bell className='w-4 h-4' />
            <span>{t('nav.notifications')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to="/my-dashboard">
            <LayoutDashboard className='w-4 h-4' />
            <span>{t('nav.myDashboard')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to="/settings">
            <Settings className='w-4 h-4' />
            <span>{t('nav.settings')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onAddAccountClick}
          className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
        >
          <UserPlus className='w-4 h-4' />
          <span>{t('auth.addAccount')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleLogout}
          className='flex items-center gap-2 cursor-pointer p-2 rounded-md text-red-500'
        >
          <LogOut className='w-4 h-4' />
          <span>{t('auth.logout')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
