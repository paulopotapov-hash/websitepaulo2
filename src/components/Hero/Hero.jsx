import './Hero.css'

export default function Hero() {
  return (
    <section data-fidelity="hero" className="hero">
      <img
        className="hero-image"
        src="/assets/hero-wix/hero-1440.avif"
        srcSet="/assets/hero-wix/hero-1280.avif 1280w, /assets/hero-wix/hero-1440.avif 1440w, /assets/hero-wix/hero-1920.avif 1920w"
        sizes="100vw"
        alt=""
      />

      <h1 className="hero-title">
        Robotic disinfection solutions for healthcare facilities
      </h1>

      <div className="hero-text">
        <h3>We work to make the greatest technological advances to reach hospitals,</h3>
        <h3>where it can be most beneficial.</h3>
      </div>
    </section>
  )
}
