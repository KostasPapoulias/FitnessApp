import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  categoriesList: [],
  recovery: 0,
  selectedCategories: [],
};

const categoriesSlice = createSlice({
  name: 'categories',
  initialState,
  reducers: {
    setCategoriesList(state, action) {
      state.categoriesList = action.payload;
    },
    setRecovery(state, action) {
      state.recovery = action.payload;
    },
    setSelectedCategories(state, action) {
      state.selectedCategories = action.payload;
    },
    resetCategoriesState() {
      return initialState;
    },
  },
});

export const {
  setCategoriesList,
  setRecovery,
  setSelectedCategories,
  resetCategoriesState,
} = categoriesSlice.actions;

export default categoriesSlice.reducer;
