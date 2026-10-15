/**
 * Review List behavior for an ambiguous general category ("chicken"):
 *  - shows the shopper's original word, not a specific product,
 *  - renders inline clarification chips with nothing preselected,
 *  - blocks "Continue to location" until resolved,
 *  - resolves the item on selection while preserving quantity.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { ReviewList } from '../pages/ReviewList'
import { resetListFromInput } from '../hooks/useGroceryList'

beforeEach(() => {
  localStorage.clear()
})

function renderReviewAt(initial = '/review') {
  const router = createMemoryRouter(
    [
      { path: '/review', element: <ReviewList /> },
      { path: '/location', element: <div>Location screen</div> },
    ],
    { initialEntries: [initial] }
  )
  return render(<RouterProvider router={router} />)
}

describe('Review List — ambiguous "chicken"', () => {
  it('shows "chicken" (not a specific cut) with clarification chips, nothing preselected', () => {
    resetListFromInput('2 lb chicken')
    renderReviewAt()

    // The displayed name is the shopper's word, not "Whole Chicken" etc.
    const name = screen.getByLabelText('Item name') as HTMLTextAreaElement
    expect(name.value.toLowerCase()).toBe('chicken')

    // Clarification chips are present.
    const group = screen.getByRole('group', { name: /choose a type/i })
    const chips = within(group).getAllByRole('button')
    const labels = chips.map((c) => c.textContent)
    expect(labels).toContain('Chicken Breast')
    expect(labels).toContain('Chicken Thighs')
    expect(labels).toContain('Chicken Wings')
    expect(labels).toContain('Whole Chicken')
    expect(labels).toContain('Other')
  })

  it('blocks Continue until the item is resolved, then allows it', () => {
    resetListFromInput('2 lb chicken')
    renderReviewAt()

    // Attempt to continue with the item unresolved → prompt, no navigation.
    fireEvent.click(screen.getByRole('button', { name: /continue to location/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/choose a type/i)
    expect(screen.queryByText('Location screen')).not.toBeInTheDocument()

    // Resolve by picking "Chicken Breast".
    const group = screen.getByRole('group', { name: /choose a type/i })
    fireEvent.click(within(group).getByText('Chicken Breast'))

    // Name updates, chips disappear, quantity preserved (stepper shows "2").
    const name = screen.getByLabelText('Item name') as HTMLTextAreaElement
    expect(name.value).toBe('Chicken Breast')
    expect(screen.queryByRole('group', { name: /choose a type/i })).not.toBeInTheDocument()
    const qtyGroup = screen.getByRole('group', { name: /quantity for/i })
    expect(within(qtyGroup).getByText('2')).toBeInTheDocument()

    // Now Continue navigates.
    fireEvent.click(screen.getByRole('button', { name: /continue to location/i }))
    expect(screen.getByText('Location screen')).toBeInTheDocument()
  })

  it('"Other" keeps the item editable without choosing a specific product', () => {
    resetListFromInput('chicken')
    renderReviewAt()

    const group = screen.getByRole('group', { name: /choose a type/i })
    fireEvent.click(within(group).getByText('Other'))

    // No specific product chosen; chips gone; name still the shopper's word.
    expect(screen.queryByRole('group', { name: /choose a type/i })).not.toBeInTheDocument()
    const name = screen.getByLabelText('Item name') as HTMLTextAreaElement
    expect(name.value.toLowerCase()).toBe('chicken')

    // And Continue is now allowed (ambiguity cleared).
    fireEvent.click(screen.getByRole('button', { name: /continue to location/i }))
    expect(screen.getByText('Location screen')).toBeInTheDocument()
  })

  it('preserves a named brand ("Perdue chicken") through clarification', () => {
    resetListFromInput('Perdue chicken')
    renderReviewAt()

    // Expand the card to see the brand select (collapsed by default is fine;
    // the ambiguous item auto-expands). The brand is already "Perdue".
    const brandSelect = screen.getByLabelText(/brand for/i) as HTMLSelectElement
    expect(brandSelect.value).toBe('Perdue')

    // Resolve to a specific cut.
    const group = screen.getByRole('group', { name: /choose a type/i })
    fireEvent.click(within(group).getByText('Chicken Breast'))

    // The product is now specific AND the brand survived.
    const name = screen.getByLabelText('Item name') as HTMLTextAreaElement
    expect(name.value).toBe('Chicken Breast')
    expect((screen.getByLabelText(/brand for/i) as HTMLSelectElement).value).toBe('Perdue')
  })
})
