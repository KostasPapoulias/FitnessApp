import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  help: ['true'],
  toggleUp: ['true'],
  toggleDown: ['true'],
};

const helpSlice = createSlice({
  name: 'help',
  initialState,
  reducers: {
    addHelp: (state, action) => {
      state.help = [action.payload];
    },
    deleteHelp: (state, action) => {
      state.help = [action.payload];
    },
    toggleUp: (state, action) => {
      state.toggleUp = [action.payload];
    },
    toggleDown: (state, action) => {
      state.toggleDown = [action.payload];
    },
  },
});

export const { addHelp, deleteHelp, toggleUp, toggleDown } = helpSlice.actions;
export default helpSlice.reducer;
