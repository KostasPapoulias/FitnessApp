import './Add.css'
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import AddIcon from '@mui/icons-material/Add';

const Add_Icon = ({ onAddPress }) => {

    return(
        <div className='Add_Icon' onClick={onAddPress}>
            <Box sx={{ '& > :not(style)': { m: 1 } }}>

                <Fab color="primary" aria-label="add" style={{ width: 70, height: 70 }}>
                    <AddIcon style={{ fontSize: 35 }}/>
                </Fab>
            </Box>
        </div>
    );
}

export default Add_Icon;
