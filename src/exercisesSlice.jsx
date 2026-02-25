import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  list: []
};

const exercisesSlice = createSlice({
  name: 'exercises',
  initialState,
  reducers: {
    addItem: (state, action) => {
      state.list.push(action.payload);
    },
    removeItem: (state, action) => {
      state.list = state.list.filter(item => item.id !== action.payload.id);
    },
    clearList: (state) => {
      state.list = [];
    },
    updateList: (state, action) => {
      state.list = state.list.filter(exercise => exercise.id !== action.payload.id);
    },
    updateExercise: (state, action) => {
      state.list = state.list.map((exercise) =>
        exercise.id === action.payload.id ? action.payload : exercise
      );
    },
    setExercises: (state, action) => {
      state.list = action.payload;
    },
  },
});

export const { 
  addItem, 
  removeItem, 
  clearList, 
  updateList, 
  updateExercise,
  setExercises 
} = exercisesSlice.actions;

export default exercisesSlice.reducer;