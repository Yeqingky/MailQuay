import { createBrowserRouter } from 'react-router';
import { AppLayout } from './AppLayout';
import { AuthGate } from './AuthGate';
import { ComposePage } from '@/pages/ComposePage';
import { LoginPage } from '@/pages/LoginPage';
import { MailPage } from '@/pages/MailPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SetupPage } from '@/pages/SetupPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/setup', element: <SetupPage /> },
  { path: '/compose', element: <ComposePage /> },
  {
    element: <AuthGate />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <MailPage /> },
          { path: 'unread', element: <MailPage /> },
          { path: 'sent', element: <MailPage /> },
          { path: 'drafts', element: <MailPage /> },
          { path: 'trash', element: <MailPage /> },
          { path: 'marked', element: <MailPage /> },
          { path: 'archive', element: <MailPage /> },
          { path: 'tasks', element: <MailPage /> },
          { path: 'accounts/:accountId/mailboxes/:mailboxId', element: <MailPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'settings/:group', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
