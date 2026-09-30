import './Navbar.css'

const links = [
  { label: 'UltraBot', href: '/ultrabot', className: 'nav-ultrabot' },
  { label: 'Benefits', href: '/benefits', className: 'nav-benefits' },
  { label: 'The Company', href: '/thecompany', className: 'nav-company' },
  { label: 'Project', href: '/projeto', className: 'nav-project' },
  { label: 'Contacts', href: '/contacts', className: 'nav-contacts' },
]

export default function Navbar() {
  return (
    <header data-fidelity="navbar" className="site-navbar">
      <div className="navbar-inner">

        <a className="navbar-logo-link" href="/" aria-label="Med Robots">
          <img
            className="navbar-logo"
            src="/assets/logo-medrobots-wix.avif"
            width="192"
            height="44"
            alt="Med Robots"
          />
        </a>

        <nav className="navbar-menu" aria-label="Main navigation">
          {links.map(link => (
            <a
              key={link.label}
              href={link.href}
              className={`navbar-item ${link.className}`}
            >
              {link.label}
            </a>
          ))}
        </nav>

      </div>
    </header>
  )
}
