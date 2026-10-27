import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiError } from '@/lib/api/errors';

export function useErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown) => {
      if (isApiError(error)) {
        if (error.code === 'search_unavailable') return t('errors.searchUnavailable');
        if (error.code === 'delete_target_missing') return t('errors.deleteTargetMissing');
        switch (error.status) {
          case 401:
            return t('errors.unauthorized');
          case 403:
            return t('errors.forbidden');
          case 404:
            return t('errors.notFound');
          case 409:
            return t('errors.conflict');
          case 429:
            return t('errors.tooManyRequests');
          case 503:
            return t('errors.serviceUnavailable');
          default:
            return error.message || t('errors.generic');
        }
      }
      if (error instanceof TypeError) return t('errors.network');
      return t('errors.generic');
    },
    [t],
  );
}
