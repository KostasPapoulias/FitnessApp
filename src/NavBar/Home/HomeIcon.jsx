import './Home.css'
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import HouseIcon from '@mui/icons-material/House';

const HomeIcon = ({ onHomePress }) => {

    return(
        <div className='HomeIcon' onClick={onHomePress}>
            <Box sx={{ '& > :not(style)': { m: 1 } }}>

                <Fab color="primary" aria-label="add" style={{ width: 70, height: 70 }}>
                    <HouseIcon style={{ fontSize: 35 }}/>
                </Fab>
            </Box>
        </div>
    );
}
export default HomeIcon;