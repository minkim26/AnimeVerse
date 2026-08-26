import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { Auth0Provider } from '@auth0/auth0-react'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'
import Auth0SyncGate from './components/Auth0SyncGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Auth0Provider
        domain={import.meta.env.VITE_AUTH0_DOMAIN}
        clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
        authorizationParams={{
          redirect_uri: window.location.origin,
          audience: import.meta.env.VITE_AUTH0_AUDIENCE,
          scope: 'openid profile email offline_access',
        }}
        cacheLocation="localstorage"
        useRefreshTokens
      >
        <Auth0SyncGate>
          <App />
        </Auth0SyncGate>
      </Auth0Provider>
    </BrowserRouter>
  </StrictMode>,
)
