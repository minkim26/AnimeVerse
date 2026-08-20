import { BrowserRouter, Routes, Route } from 'react-router'
import Home from './pages/Home.tsx'
import Login from './pages/Login.tsx'
import Signup from './pages/Signup.tsx'
import Preferences from './pages/Preferences.tsx'
import Explore from './pages/Explore.tsx'
import Profile from './pages/Profile.tsx'
import PrivacyPolicy from './pages/PrivacyPolicy.tsx'
import NotFound from './pages/NotFound.tsx'
import Discover from './pages/Discover.tsx'
import ProtectedRoute from './components/ProtectedRoute.tsx'
import RedirectIfAuthenticated from './components/RedirectIfAuthenticated.tsx'
import RequireOnboarding from './components/RequireOnboarding.tsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <Login />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/signup"
          element={
            <RedirectIfAuthenticated>
              <Signup />
            </RedirectIfAuthenticated>
          }
        />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route
          path="/preferences"
          element={
            <ProtectedRoute>
              <Preferences />
            </ProtectedRoute>
          }
        />
        <Route
          path="/discover"
          element={
            <ProtectedRoute>
              <Discover />
            </ProtectedRoute>
          }
        />
        <Route
          path="/explore"
          element={
            <ProtectedRoute>
              <RequireOnboarding>
                <Explore />
              </RequireOnboarding>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
