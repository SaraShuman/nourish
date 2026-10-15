import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Welcome } from './pages/Welcome'
import { ReviewList } from './pages/ReviewList'
import { AddLocation } from './pages/AddLocation'
import { ComparePrices } from './pages/ComparePrices'
import { NearbyStores } from './pages/NearbyStores'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true,        element: <Welcome />      },
      { path: 'review',     element: <ReviewList />   },
      { path: 'location',   element: <AddLocation />  },
      { path: 'compare',    element: <ComparePrices /> },
      { path: 'nearby',     element: <NearbyStores /> },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
