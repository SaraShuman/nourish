/**
 * Smoke tests — verify each route renders without crashing
 * and that key structural elements are present.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Welcome } from '../pages/Welcome'
import { ReviewList } from '../pages/ReviewList'
import { AddLocation } from '../pages/AddLocation'
import { ComparePrices } from '../pages/ComparePrices'
import { NearbyStores } from '../pages/NearbyStores'

beforeEach(() => {
  localStorage.clear()
})

describe('Welcome page', () => {
  it('renders the headline', () => {
    render(
      <MemoryRouter>
        <Welcome />
      </MemoryRouter>
    )
    expect(
      screen.getByRole('heading', { name: /Compare grocery prices/i })
    ).toBeInTheDocument()
  })

  it('renders the grocery input textarea', () => {
    render(
      <MemoryRouter>
        <Welcome />
      </MemoryRouter>
    )
    expect(screen.getByRole('textbox', { name: /What groceries/i })).toBeInTheDocument()
  })

  it('disables the CTA when input is empty', () => {
    render(
      <MemoryRouter>
        <Welcome />
      </MemoryRouter>
    )
    // When empty, aria-label is "Enter your grocery list to find savings"
    const btn = screen.getByRole('button', { name: /Enter your grocery list/i })
    expect(btn).toBeDisabled()
  })

  it('enables the CTA after typing', () => {
    const { getByRole } = render(
      <MemoryRouter>
        <Welcome />
      </MemoryRouter>
    )
    const textarea = getByRole('textbox', { name: /What groceries/i })
    fireEvent.change(textarea, { target: { value: 'bananas' } })

    // After typing, aria-label becomes "Find my savings"
    const btn = getByRole('button', { name: /Find my savings/i })
    expect(btn).not.toBeDisabled()
  })
})

describe('ReviewList page', () => {
  it('renders the progress indicator with List active', () => {
    render(
      <MemoryRouter>
        <ReviewList />
      </MemoryRouter>
    )
    expect(screen.getByRole('navigation', { name: /Progress/i })).toBeInTheDocument()
  })

  it('renders a page heading (empty state when no input)', () => {
    render(
      <MemoryRouter>
        <ReviewList />
      </MemoryRouter>
    )
    // With no seeded input, the list is empty and shows the empty-state heading.
    expect(
      screen.getByRole('heading', { name: /Your list is empty/i })
    ).toBeInTheDocument()
  })
})

describe('AddLocation page', () => {
  it('renders the progress indicator with Location active', () => {
    render(
      <MemoryRouter>
        <AddLocation />
      </MemoryRouter>
    )
    expect(screen.getByRole('navigation', { name: /Progress/i })).toBeInTheDocument()
  })
})

describe('ComparePrices page', () => {
  it('renders the concise demo-prices disclosure', () => {
    render(
      <MemoryRouter>
        <ComparePrices />
      </MemoryRouter>
    )
    expect(
      screen.getByText(/demo price estimates · actual store locations · prices and inventory are not verified/i)
    ).toBeInTheDocument()
  })
})

describe('NearbyStores page', () => {
  it('shows the heading and the real-locations / simulated-prices disclaimer', () => {
    render(
      <MemoryRouter>
        <NearbyStores />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: /your shopping trip/i })).toBeInTheDocument()
    expect(screen.getByText(/store locations and distances are real/i)).toBeInTheDocument()
    // Shopping Trip keeps the header/back/title but has NO progress indicator.
    expect(screen.queryByRole('navigation', { name: /progress/i })).not.toBeInTheDocument()
  })

  it('prompts to pick a store when none is selected', () => {
    render(
      <MemoryRouter>
        <NearbyStores />
      </MemoryRouter>
    )
    expect(screen.getByText(/no store is selected yet/i)).toBeInTheDocument()
  })
})
