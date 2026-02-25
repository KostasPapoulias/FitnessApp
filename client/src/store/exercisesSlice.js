import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  list: [],
};

const exercisesSlice = createSlice({
  name: 'exercises',
  initialState,
  reducers: {
    setExercisesList(state, action) {
      state.list = action.payload;
    },
    resetExercisesState() {
      return initialState;
    },
  },
});

export const { setExercisesList, resetExercisesState } = exercisesSlice.actions;

export default exercisesSlice.reducer;
