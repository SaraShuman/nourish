/**
 * End-to-end-ish flow test: type a grocery list on the Welcome screen,
 * tap "Find my savings", and verify the items appear on the Review screen.
 *
 * This exercises the real chain: Welcome input -> resetListFromInput ->
 * navigation -> useGroceryList -> ReviewList rendering.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Welcome } from '../pages/Welcome'
import { ReviewList } from '../pages/ReviewList'

beforeEach(() => {
  localStorage.clear()
})

function renderFlow() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Welcome /> },
      { path: '/review', element: <ReviewList /> },
    ],
    { initialEntries: ['/'] }
  )
  return render(<RouterProvider router={router} />)
}

describe('Welcome -> Review flow', () => {
  it('shows the typed list on the review screen', () => {
    renderFlow()

    // Type the list on Welcome.
    const textarea = screen.getByRole('textbox', {
      name: /What groceries/i,
    }) as HTMLTextAreaElement
    fireEvent.change(textarea, {
      target: { value: 'very ripe bananas, Perdue chicken thighs' },
    })

    // Submit.
    fireEvent.click(screen.getByRole('button', { name: /find my savings/i }))

    // We should now be on the review screen with 2 recognized items. Names
    // appear as scannable text in the collapsed rows.
    expect(screen.getByText('Bananas')).toBeInTheDocument()
    // "chicken thighs" now resolves to its own catalog entry (not breast).
    expect(screen.getByText('Chicken Thighs')).toBeInTheDocument()
    expect(screen.queryByText('Chicken Breast')).not.toBeInTheDocument()

    // The headline reflects the count.
    expect(
      screen.getByRole('heading', { name: /I found 2 items!/i })
    ).toBeInTheDocument()

    // Perdue brand was recognized on the chicken row — expand it to see the
    // brand control, which should hold "Perdue".
    fireEvent.click(screen.getByRole('button', { name: /^Edit Chicken Thighs/i }))
    const brand = screen.getByLabelText(/brand for/i) as HTMLSelectElement
    expect(brand.value).toBe('Perdue')

    // Sanity: the grocery list (not the progress-steps list) holds two cards.
    const groceryList = document.querySelector('.review__list') as HTMLElement
    expect(groceryList).not.toBeNull()
    expect(within(groceryList).getAllByRole('listitem')).toHaveLength(2)
  })
})
