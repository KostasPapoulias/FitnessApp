import './Profile.css'
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Person2Icon from '@mui/icons-material/Person2';

const ProfileIcon = ({ onProfilePress }) => {
    return (
        <div className='ProfileIcon' onClick={onProfilePress}>
            <Box sx={{ '& > :not(style)': { m: 1 } }}>
                <Fab color="primary" aria-label="add" style={{ width: 70, height: 70 }}>
                    <Person2Icon style={{ fontSize: 35 }}/>
                </Fab>
            </Box>
        </div>
    );
};

export default ProfileIcon;