import './UltraBot.css'

export default function UltraBot() {
  return (
    <>
      <section className="ultrabot-image-section" aria-label="UltraBot image">
        <img
          className="ultrabot-image"
          src="/assets/ultrabot-wix-658x445.avif"
          width="658"
          height="445"
          alt="ChatGPT Image Sep 18, 2026, 04_14_49 PM_edited.jpg"
        />
      </section>

      <section className="ultrabot-copy-section" aria-label="UltraBot">
        <h1 className="ultrabot-title">UltraBot</h1>
        <p className="ultrabot-intro-wrap">
          <span className="ultrabot-intro">Introducing the UltraBot, the ultimate UV-C light disinfection robot</span>
          <span> engineered for healthcare environments.</span>
        </p>
      </section>
    </>
  )
}
