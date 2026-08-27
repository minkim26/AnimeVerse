import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useNavigate } from 'react-router'
import { Auth0Provider, type AppState } from '@auth0/auth0-react'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'
import Auth0SyncGate from './components/Auth0SyncGate.tsx'

// eslint-disable-next-line react-refresh/only-export-components -- main.tsx is the app entry point, not itself hot-reloaded; this wrapper only exists to give onRedirectCallback access to useNavigate().
function Auth0ProviderWithNavigate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()

  function onRedirectCallback(appState?: AppState) {
    navigate(appState?.returnTo ?? '/profile')
  }

  return (
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
      onRedirectCallback={onRedirectCallback}
    >
      {children}
    </Auth0Provider>
  )
}

const requiredAuth0Env = ['VITE_AUTH0_DOMAIN', 'VITE_AUTH0_CLIENT_ID', 'VITE_AUTH0_AUDIENCE'] as const
for (const key of requiredAuth0Env) {
  if (!import.meta.env[key]) {
    throw new Error(`${key} is not defined in env variables`)
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Auth0ProviderWithNavigate>
        <Auth0SyncGate>
          <App />
        </Auth0SyncGate>
      </Auth0ProviderWithNavigate>
    </BrowserRouter>
  </StrictMode>,
)
