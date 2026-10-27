import { useQuery } from '@tanstack/react-query';
import { authKeys, fetchAuthStatus, type AuthStatus } from '@/features/auth/api';

export function useAuthStatus() {
  return useQuery<AuthStatus>({
    queryKey: authKeys.me,
    queryFn: fetchAuthStatus,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useCurrentUser() {
  const query = useAuthStatus();
  return { ...query, user: query.data?.user };
}
