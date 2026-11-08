import { render, screen } from '@/tests/test-utils'
import LoadingAnimation from '@/components/ui/LoadingAnimation'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import sv from '@/lib/i18n/dictionaries/sv'

describe('LoadingAnimation Component', () => {
  it('renders loading state with text', () => {
    render(<LoadingAnimation text="Loading..." noun="page" />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading...')
  })

  it('renders terminal chrome without structural emoji icons', () => {
    const { container } = render(<LoadingAnimation text="Please wait" noun="projects" />)

    expect(screen.getByText('~/portfolio - zsh')).toBeInTheDocument()
    expect(screen.getByText('Receiving projects…')).toBeInTheDocument()
    expect(container.textContent).not.toContain('📁')
  })

  it('renders with custom text', () => {
    const customText = "Fetching data"
    render(<LoadingAnimation text={customText} noun="data" />)

    expect(screen.getByRole('status')).toHaveTextContent(customText)
  })

  it('uses an explicit localized resource name in the terminal copy', () => {
    render(
      <I18nProvider locale="sv" dictionary={sv}>
        <LoadingAnimation text="Laddar kompetenser..." noun="Kompetenser" />
      </I18nProvider>,
    )

    expect(screen.getByText('Kompetenser')).toBeInTheDocument()
    expect(screen.getByText('Tar emot Kompetenser…')).toBeInTheDocument()
  })
})
