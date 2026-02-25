import React from 'react';
import { useState } from 'react';
import './Introduction.css';

function Introduction() {

    const [currentStep, setCurrentStep] = useState(0);
    
    const handleLevel = (level) => {
        alert(`You selected ${level}!`);
        nextStep();
    }
    const handleGoal = (goal) => {
        alert(`You selected ${goal}!`);
        nextStep();
    }
    const handleGym = (gym) => {
        alert(`You selected ${gym}!`);
        nextStep();
    }
    const handleProfile = (profile) => {
        alert(`You selected ${profile}!`);
    }

    const steps = [
        {
            content: <FirstPage getLevel={handleLevel} />,
        },
        {
            content: <SecondPage getGoal={handleGoal} />,
        },
        {
            content: <ThirdPage getGym={handleGym} />,
        },
        {
            content: <FourthPage getProfile={handleProfile}/>,
        }
    ];
    
    const nextStep = () => {
        setCurrentStep((prevStep) => Math.min(prevStep + 1, steps.length - 1));
    };
    
    const prevStep = () => {
        setCurrentStep((prevStep) => Math.max(prevStep - 1, 0));
    };
    
    return (
        <>
        <div className='context'>
            
            <p>{steps[currentStep].content}</p>
        </div>
        <div>
            <button className='previousButton' onClick={prevStep} disabled={currentStep === 0}>
                Previous
            </button>
            {currentStep < steps.length - 1 ? (
            <button className="nextButton" onClick={nextStep}>Skip</button>
            ) : (
            <button className="nextButton" onClick={() => alert('Introduction Finished!')}>Finish</button>
            )}
        </div>
        </>
    );
};

const FirstPage = ({ getLevel }) => {

    const handleClick = (level) => {
        getLevel(level);
    }

    return(
        <div>
            <h2>How experienced are you with lifting weights?</h2>
            <div className='options' onClick={() => handleClick("Beginner")}>
                <h3>Beginner</h3>
                <span>You haven't tried weighted exercises or just started lifting weights.</span>
            </div>
            <div className='options' onClick={() => handleClick("Intermediate")}>
                <h3>Intermediate</h3>
                <span>You've tried and practiced common weighted exercies</span>
            </div>
            <div className='options' onClick={() => handleClick("Advanced")}>
                <h3>Advanced</h3>
                <span>You've practiced strength-training for years. Compound barbell exercises are your jam!</span>
            </div>
        </div>                                                                                                                                                                                                                                
    );
}

const SecondPage = ({getGoal}) => {

    const handleClick = (goal) => {
        getGoal(goal);
    }

    return(
        <div>
            <h2>What's your main reason for joining Fitbod?</h2>
            <div className='options' onClick={() => handleClick("IncreaseMass")}>
                <h3>Increase muscle mass and size</h3>
                <span>Focus on both large and small muscle groups with exercises that isolate the muscle. Higher reps, lower weight.</span>
            </div>
            <div className='options' onClick={() => handleClick("IncreaseStrength")}>
                <h3>Get stronger and lift more weight</h3>
                <span>Focus on large muscle groups with more compound exercises. Fewer Reps, higher weight.</span>
            </div>
            <div className='options' onClick={() => handleClick("LossWeight")}>
                <h3>Tone muscle and lose weight.</h3>
                <span>Do higher reps and lower weight in circuit training formats. Less complex exercises with more basic equipment.</span>
            </div>
            <div className='options' onClick={() => handleClick("HIIT")}>
                <h3>Do HIIT style interval training.</h3>
                <span>Break a sweat with HIIT inspired interval training, where you'll perform exercises over a period of time.</span>
            </div>
            <div className='options' onClick={() => handleClick("NoEquiptment")}>
                <h3>Do workouts with no gym equipment.</h3>
                <span>Perform exercises that only require your body and no other equipment.</span>
            </div>
        </div>                                                                                                                                                                                                                                
    );
}

const ThirdPage = ({getGym}) => {
    const handleClick = (gym) => {
        getGym(gym);
    }

    return(
        <div>
            <h2>Where do you exercise?</h2>
            <div className='options' onClick={() => handleClick("LargeGym")}>
                <h3>Large Gym</h3>
                <span>Full fitness clubs such as Anytime, Planet Fitness, Golds, 24-Hour, Equinox.</span>
            </div>
            <div className='options' onClick={() => handleClick("SmallGym")}>
                <h3>Small Gym</h3>
                <span>Compact public gyms with limited equipment</span>
            </div>
            <div className='options' onClick={() => handleClick("GarageGym")}>
                <h3>Garage Gym</h3>
                <span>Barbells, squat rack, dumbbells and more.</span>
            </div>
            <div className='options' onClick={() => handleClick("HomeGym")}>
                <h3>At Home</h3>
                <span>Limited equipment such as dumbbells, bands, pull-up bars, etc.</span>
            </div>
            <div className='options' onClick={() => handleClick("Bodyweight")}>
                <h3>Bodyweight</h3>
                <span>Workout anywhere without gym equipment.</span>
            </div>
            <div className='options' onClick={() => handleClick("Custom")}>
                <h3>Custom</h3>
                <span>Start from scratch and build your own equipment list.</span>
            </div>
        </div>                                                                                                                                                                                                                                
    );
}
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';

const FourthPage = ({getProfile}) => {
    const handleClick = (profile) => {
        getProfile(profile);
    }

    return(
        <div>
            <h2>Add your body stats for the best workout recommendation</h2>
            <ColorToggleButton />
            <br/>
            Weight
            <BasicTextFields />
            <br/>
            Age
            <CommonlyUsedComponents />

        </div>
    );
}
import { styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Stack from '@mui/material/Stack';
import { DemoContainer, DemoItem } from '@mui/x-date-pickers/internals/demo';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';


const ProSpan = styled('span')({
  display: 'inline-block',
  height: '1em',
  width: '1em',
  verticalAlign: 'middle',
  marginLeft: '0.3em',
  marginBottom: '0.08em',
  backgroundSize: 'contain',
  backgroundRepeat: 'no-repeat',
  backgroundImage: 'url(https://mui.com/static/x/pro.svg)',
});

function Label({ componentName, valueType, isProOnly }) {
  

  if (isProOnly) {
    return (
      <Stack direction="row" spacing={0.5} component="span">
        <Tooltip title="Included on Pro package">
          <a
            href="https://mui.com/x/introduction/licensing/#pro-plan"
            aria-label="Included on Pro package"
          >
            <ProSpan />
          </a>
        </Tooltip>
        
      </Stack>
    );
  }

  
}

function CommonlyUsedComponents() {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DemoContainer
        components={[
          'DatePicker',
        ]}
      >
        <DemoItem label={<Label componentName="DatePicker" valueType="date" />}>
          <DatePicker />
        </DemoItem>
        
      </DemoContainer>
    </LocalizationProvider>
  );
}

function BasicTextFields() {
    return (
      <Box
        component="form"
        sx={{
          '& > :not(style)': { m: 1, width: '25ch' },
        }}
        noValidate
        autoComplete="off"
      >
        <TextField id="outlined-basic" label="Enter..." variant="outlined" />
        
      </Box>
    );
  }

function ColorToggleButton() {
    const [alignment, setAlignment] = React.useState('web');
  
    const handleChange = (event, newAlignment) => {
      setAlignment(newAlignment);
    };
  
    return (
      <ToggleButtonGroup
        color="primary"
        value={alignment}
        exclusive
        onChange={handleChange}
        aria-label="Platform"
      >
        <ToggleButton value="Male">Male</ToggleButton>
        <ToggleButton value="Female">Female</ToggleButton>
        <ToggleButton value="Other">Other</ToggleButton>
      </ToggleButtonGroup>
    );
  }

export default Introduction;