// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Bell, ChevronDown, CircleHelp, LogOut, Search, Settings, User, UserIcon, UserPlus, Wallet } from 'lucide-react';
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
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { genUserName } from '@/lib/genUserName';

interface AccountSwitcherProps {
  onAddAccountClick: () => void;
}

export function AccountSwitcher({ onAddAccountClick }: AccountSwitcherProps) {
  const { currentUser, otherUsers, isLoading, setLogin, removeLogin } = useLoggedInAccounts();
  const { orderedItems } = useFeedSettings();
  const [isOpen, setIsOpen] = useState(false);

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

  return (
    <DropdownMenu modal={false} open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button className='flex items-center gap-2 h-10 p-1 pr-2.5 rounded-full hover:bg-accent transition-all text-foreground'>
          {isLoading ? (
            <Skeleton className='w-8 h-8 rounded-full shrink-0' />
          ) : (
            <Avatar className='w-8 h-8'>
              <AvatarImage src={currentUser.metadata.picture} alt={getDisplayName(currentUser)} />
              <AvatarFallback>{getDisplayName(currentUser).charAt(0)}</AvatarFallback>
            </Avatar>
          )}
          <ChevronDown className='w-4 h-4 text-muted-foreground' />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56 p-2 animate-scale-in'>
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
            {user.id === currentUser.id && <div className='w-2 h-2 rounded-full bg-primary'></div>}
          </DropdownMenuItem>
        ))}
        {orderedItems.includes('dashboard') && (
          <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
            <Link to="/dashboard">
              <Activity className='w-4 h-4' />
              <span>Dashboard</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to="/wallet">
            <Wallet className='w-4 h-4' />
            <span>Wallet</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to="/notifications">
            <Bell className='w-4 h-4' />
            <span>Notifications</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to={`/${nip19.npubEncode(currentUser.pubkey)}`}>
            <User className='w-4 h-4' />
            <span>Profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to="/search">
            <Search className='w-4 h-4' />
            <span>Search</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to="/settings">
            <Settings className='w-4 h-4' />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className='flex items-center gap-2 cursor-pointer p-2 rounded-md'>
          <Link to="/help">
            <CircleHelp className='w-4 h-4' />
            <span>Help</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onAddAccountClick}
          className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
        >
          <UserPlus className='w-4 h-4' />
          <span>Add another account</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleLogout}
          className='flex items-center gap-2 cursor-pointer p-2 rounded-md text-red-500'
        >
          <LogOut className='w-4 h-4' />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
