import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReviewList } from '../pages/ReviewList'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(
    'nourish:raw-input',
    'bananas 3 lb, Perdue chicken breast 1.5 lb, dragon fruit'
  )
})

function renderReview() {
  return render(
    <MemoryRouter>
      <ReviewList />
    </MemoryRouter>
  )
}

describe('ReviewList page', () => {
  it('shows the found-items headline with the correct count', () => {
    renderReview()
    expect(
      screen.getByRole('heading', { name: /I found 3 items!/i })
    ).toBeInTheDocument()
  })

  it('keeps the List → Location → Compare progress indicator', () => {
    renderReview()
    expect(screen.getByRole('navigation', { name: /Progress/i })).toBeInTheDocument()
  })

  it('renders a compact row per item, including the unrecognized one', () => {
    renderReview()
    // Collapsed rows show the product name as scannable text.
    expect(screen.getByText('Bananas')).toBeInTheDocument()
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument()
    // Unrecognized item is retained for review.
    expect(screen.getByText(/dragon fruit/i)).toBeInTheDocument()
    // Three rows total (one expand toggle each).
    expect(screen.getAllByRole('button', { name: /^Edit |^Hide details/i })).toHaveLength(3)
  })

  it('changes quantity via the compact stepper in the collapsed row', () => {
    renderReview()
    // Bananas is the first row, started at 3.
    const incButtons = screen.getAllByRole('button', { name: /increase quantity/i })
    fireEvent.click(incButtons[0])
    expect(screen.getByText('3.5')).toBeInTheDocument()
  })

  it('removes an item from the expanded controls', () => {
    renderReview()
    // Expand the first row, then use the delete action inside it.
    fireEvent.click(screen.getAllByRole('button', { name: /^Edit /i })[0])
    fireEvent.click(screen.getByRole('button', { name: /remove item/i }))
    expect(
      screen.getByRole('heading', { name: /I found 2 items!/i })
    ).toBeInTheDocument()
  })

  it('adds a new item', () => {
    renderReview()
    fireEvent.click(screen.getByRole('button', { name: /add another item/i }))
    expect(
      screen.getByRole('heading', { name: /I found 4 items!/i })
    ).toBeInTheDocument()
  })

  it('defaults the substitutions switch to OFF and toggles it', () => {
    renderReview()
    const sw = screen.getByRole('switch', { name: /allow brand substitutions/i })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })

  it('shows an exact-brand notice (in expanded controls) when a brand is set and subs are OFF', () => {
    renderReview()
    // The Perdue chicken breast item has a brand set by the parser; expand it.
    fireEvent.click(screen.getByRole('button', { name: /^Edit Chicken Breast/i }))
    expect(screen.getByText(/Exact brand required/i)).toBeInTheDocument()
  })

  it('switches the brand notice to alternatives-allowed when subs turn ON', () => {
    renderReview()
    fireEvent.click(screen.getByRole('switch', { name: /allow brand substitutions/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Edit Chicken Breast/i }))
    expect(screen.getByText(/Comparable alternatives may be suggested/i)).toBeInTheDocument()
  })
})
