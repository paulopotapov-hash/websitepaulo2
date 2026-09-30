import Navbar from '../../components/Navbar/Navbar.jsx'
import Hero from '../../components/Hero/Hero.jsx'
import Intro from '../../components/Intro/Intro.jsx'
import PharmaRobot from '../../components/PharmaRobot/PharmaRobot.jsx'
import UltraBot from '../../components/UltraBot/UltraBot.jsx'
import Footer from '../../components/Footer/Footer.jsx'

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Intro />
        <PharmaRobot />
        <UltraBot />
      </main>
      <Footer />
    </>
  )
}
