import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  categoriesList: [],
  recovery: [
    { name: 'Triceps', count: 0 },
    { name: 'Biceps', count: 0 },
    { name: 'Chest', count: 0 },
    { name: 'Shoulders', count: 0 },
    { name: 'Abs', count: 0 },
    { name: 'Traps', count: 0 },
    { name: 'Lats', count: 0 },
    { name: 'Calves', count: 0 },
    { name: 'Quads', count: 0 },
    { name: 'Glutes', count: 0 },
    { name: 'Hamstrings', count: 0 },
    { name: 'Forearms', count: 0 },
  ],
  selectedCategories: [],
};

const categoriesSlice = createSlice({
  name: 'categories',
  initialState,
  reducers: {
    addCategory: (state, action) => {
      state.categoriesList.push(action.payload);
    },
    clearCategory: (state) => {
      state.categoriesList = [];
    },
    removeCategory: (state, action) => {
      state.categoriesList = state.categoriesList.filter(category => category !== action.payload);
    },
    incrementCategoryCount: (state, action) => {
      state.recovery = state.recovery.map(category =>
        category.name === action.payload && category.count < 2
          ? { ...category, count: category.count + 1 }
          : category
      );
    },
    decrementCategoryCount: (state, action) => {
      state.recovery = state.recovery.map(category =>
        category.name === action.payload && category.count > 0
          ? { ...category, count: category.count - 1 }
          : category
      );
    },
    addSelectedCategory: (state, action) => {
      state.selectedCategories.push(action.payload);
    },
    clearSelectedCategory: (state) => {
      state.selectedCategories = [];
    },
    setCategories: (state, action) => {
      state.categoriesList = action.payload;
    },
  },
});

export const {
  addCategory,
  clearCategory,
  removeCategory,
  incrementCategoryCount,
  decrementCategoryCount,
  addSelectedCategory,
  clearSelectedCategory,
  setCategories,
} = categoriesSlice.actions;

export default categoriesSlice.reducer;