import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  help: false,
  toggleUp: false,
  toggleDown: false,
};

const helpSlice = createSlice({
  name: 'help',
  initialState,
  reducers: {
    setHelp(state, action) {
      state.help = action.payload;
    },
    setToggleUp(state, action) {
      state.toggleUp = action.payload;
    },
    setToggleDown(state, action) {
      state.toggleDown = action.payload;
    },
    resetHelpState() {
      return initialState;
    },
  },
});

export const { setHelp, setToggleUp, setToggleDown, resetHelpState } = helpSlice.actions;

export default helpSlice.reducer;
