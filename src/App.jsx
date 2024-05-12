import { useState } from 'react'
import { styled } from '@mui/system';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import MenuIcon from '@mui/icons-material/Menu';
import './App.css'
import NavBar from './NavBar/NavBar.jsx'
import Options from './Options.jsx'

function App() {
   
  const [showOptions, setShowOptions] = useState(false);
  const handleShowOptions = () => {
    setShowOptions(!showOptions);
  };
  const TransparentFab = styled(Fab)({
    backgroundColor: 'transparent',
  });

  return(
    <div>
      <div className='container' >
        {/* <span className='menuIcon' onClick={handleShowOptions}>
          <TransparentFab>
            <MenuIcon style={{ fontSize: 35 }} />
          </TransparentFab>
        </span>   */}

        {showOptions && <Options />}
        <NavBar />
      </div>
    </div>
  );
}

export default App
