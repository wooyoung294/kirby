import './App.css'
import Kirby from "./Kirby.jsx";
import SplitText from './SplitText.jsx';
import {Parallax, ParallaxLayer} from "@react-spring/parallax";
function App() {
    const handleAnimationComplete = () => {
        console.log('All letters have animated!');
    };
  return (
    <>
        <Parallax pages={2} style={{ top: '0', left: '0' }} className='base-layer'>
            <ParallaxLayer offset={0} speed={2.5} className='first-layer'>
                <SplitText
                    text="KiRBY"
                    className="text-2xl font-semibold text-center hello-text"
                    delay={170}
                    duration={2}
                    ease="power3.out"
                    splitType="chars"
                    from={{ opacity: 0, y: 40 }}
                    to={{ opacity: 1, y: 0 }}
                    threshold={0.5}
                    rootMargin="-100px"
                    textAlign="center"
                    onLetterAnimationComplete={handleAnimationComplete}
                />
            </ParallaxLayer>
            <ParallaxLayer offset={1} >
                <Kirby/>
            </ParallaxLayer>
        </Parallax>
    </>
  )
}

export default App
