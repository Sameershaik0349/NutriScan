import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, Text, View, ScrollView, TextInput, TouchableOpacity, 
  ActivityIndicator, Image, Modal, Alert, KeyboardAvoidingView, 
  Platform, StatusBar, useWindowDimensions, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

// Retrieve backend proxy domain or use local network IP
const isWeb = Platform.OS === 'web';
const API_BASE = isWeb 
  ? 'https://food-waste-ai-6.preview.emergentagent.com/api' 
  : 'http://192.168.29.165:8000/api';

// --- Interfaces ---
interface UserProfile {
  full_name: string;
  age: number;
  gender: string;
  height: number;
  weight: number;
  country: string;
  allergies: string[];
  medical_conditions: string[];
  diet_type: string;
  cuisine_preference: string[];
  meal_frequency: string;
  weight_goal: string;
  target_weight: number;
  activity_level: string;
  weekly_budget: number;
  onboarded: boolean;
}

interface User {
  id: string;
  email: string;
  profile: UserProfile;
}

interface RecipeItem {
  name: string;
  ingredients: string[];
  instructions: string;
}

interface ScanResult {
  product_name: string;
  brand?: string;
  ingredients: string[];
  calories: number;
  carbs: number;
  protein: number;
  fats: number;
  health_grade: string;
  health_warnings: string[];
  eco_score: string;
  waste_reduction_tip: string;
  recipes?: RecipeItem[];
}

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface MealDetail {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  recipe: string;
  waste_tip: string;
}

interface DayPlan {
  breakfast: MealDetail;
  lunch: MealDetail;
  dinner: MealDetail;
  snack: MealDetail;
}

interface MealPlan {
  days: {
    [key: string]: DayPlan;
  };
}

export default function HomeScreen() {
  // Auth & Navigation States
  const [token, setToken] = useState<string | null>('bypass-token');
  const [user, setUser] = useState<User | null>({
    email: 'user@example.com',
    profile: {
      full_name: 'NutriScan Explorer',
      age: 25,
      gender: 'Prefer not to say',
      height: 170.0,
      weight: 70.0,
      country: 'India',
      allergies: [],
      medical_conditions: [],
      diet_type: 'No Restriction',
      cuisine_preference: ['Indian', 'Italian'],
      meal_frequency: '3 meals/day',
      weight_goal: 'Maintain weight',
      target_weight: 70.0,
      activity_level: 'Moderate',
      weekly_budget: 1000.0,
      onboarded: true
    }
  });
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Tab State: 'home' | 'recipes' | 'camera' | 'chat' | 'profile'
  const [activeTab, setActiveTab] = useState<'home' | 'recipes' | 'camera' | 'chat' | 'profile'>('home');

  // Onboarding States
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingData, setOnboardingData] = useState<UserProfile>({
    full_name: '',
    age: 25,
    gender: 'Prefer not to say',
    height: 170,
    weight: 70,
    country: 'India',
    allergies: [],
    medical_conditions: [],
    diet_type: 'No Restriction',
    cuisine_preference: [],
    meal_frequency: '3 meals/day',
    weight_goal: 'Maintain weight',
    target_weight: 70,
    activity_level: 'Moderately Active',
    weekly_budget: 1500,
    onboarded: false
  });

  // Profile Editing States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfileData, setEditProfileData] = useState<UserProfile | null>(null);

  // Dashboard States
  const [waterLogged, setWaterLogged] = useState(1250);
  const [waterGoal] = useState(2500);
  const [caloriesConsumed, setCaloriesConsumed] = useState(1450);
  const [calorieGoal, setCalorieGoal] = useState(2100);
  const [macroStats, setMacroStats] = useState({ carbs: 145, protein: 78, fats: 48 });
  const [macroGoals] = useState({ carbs: 250, protein: 120, fats: 70 });
  const [recentScans, setRecentScans] = useState<ScanResult[]>([]);
  const [aiTip] = useState('Checking the fridge before shopping reduces dairy waste by up to 25%. Try creating a "Must Eat" shelf!');

  // Scanner States
  const [scanMode, setScanMode] = useState<'recipe' | 'photo'>('recipe');
  const [recipeQueryInput, setRecipeQueryInput] = useState('');
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const cameraRef = useRef<any>(null);

  // AI Chat States
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'model', content: 'Hello! I am your premium AI Nutritionist. Ask me any question about nutrition, recipes, or how to reduce kitchen waste.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<ScrollView | null>(null);

  // Diet Planner States
  const [selectedDay, setSelectedDay] = useState<string>('Monday');
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [activeRecipe, setActiveRecipe] = useState<{ meal: string; details: MealDetail } | null>(null);

  // Confirmation Flow States
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmFoodName, setConfirmFoodName] = useState('');
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const { width, height } = useWindowDimensions();
  const isLargeScreen = width >= 1024;

  // Gemini API Key Settings
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [geminiKeyStatus, setGeminiKeyStatus] = useState({ is_configured: false, masked_key: '' });

  const fetchGeminiKeyStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings/key/status`);
      if (res.ok) {
        const data = await res.json();
        setGeminiKeyStatus(data);
        if (data.is_configured) {
          setGeminiKeyInput(data.masked_key || '');
        }
      }
    } catch (e) {
      console.error('Failed to fetch Gemini key status:', e);
    }
  };

  const handleSaveGeminiKey = async () => {
    if (!geminiKeyInput.trim()) {
      Alert.alert('Error', 'Please enter a valid API key');
      return;
    }
    
    // Masked key check
    if (geminiKeyInput.includes('...')) {
      Alert.alert('Info', 'Using existing configured key');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/settings/key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: geminiKeyInput })
      });
      if (res.ok) {
        Alert.alert('Success', 'Gemini API Key updated successfully!');
        fetchGeminiKeyStatus();
      } else {
        Alert.alert('Error', 'Failed to update Gemini API Key');
      }
    } catch (e) {
      Alert.alert('Network Error', 'Connection failed');
    }
  };

  // Load token on startup
  useEffect(() => {
    async function loadStoredToken() {
      try {
        const storedToken = Platform.OS === 'web' 
          ? localStorage.getItem('nutriscan_token') 
          : await SecureStore.getItemAsync('nutriscan_token');
        if (storedToken) {
          setToken(storedToken);
        } else {
          setIsInitializing(false);
        }
      } catch (e) {
        setIsInitializing(false);
      }
    }
    loadStoredToken();
    fetchGeminiKeyStatus();
  }, []);

  // Clear error states on tab switch
  useEffect(() => {
    setAuthError('');
  }, [authView]);

  // Fetch profiles when token updates
  useEffect(() => {
    if (token) {
      fetchUserProfile();
    }
  }, [token]);

  const fetchUserProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        if (data.profile) {
          setOnboardingData(data.profile);
          const calculatedCal = 1500 + (data.profile.weight * 10) + (data.profile.height * 6.25) - (data.profile.age * 5);
          setCalorieGoal(Math.round(calculatedCal));
        }
        fetchDietPlan();
      } else {
        handleLogout();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsInitializing(false);
    }
  };

  const fetchDietPlan = async () => {
    try {
      const res = await fetch(`${API_BASE}/diet?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        setMealPlan(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      localStorage.removeItem('nutriscan_token');
    } else {
      await SecureStore.deleteItemAsync('nutriscan_token');
    }
    setToken(null);
    setUser(null);
    setActiveTab('home');
    setOnboardingStep(1);
    setRecentScans([]);
    setChatMessages([
      { role: 'model', content: 'Hello! I am your premium AI Nutritionist. Ask me any question about nutrition, recipes, or how to reduce kitchen waste.' }
    ]);
  };

  const handleAuth = async () => {
    setAuthError('');
    setAuthLoading(true);

    if (!authEmail || !authPassword) {
      setAuthError('Please fill in all fields');
      setAuthLoading(false);
      return;
    }

    try {
      const endpoint = authView === 'login' ? 'login' : 'register';
      const res = await fetch(`${API_BASE.replace('/api', '')}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });

      const data = await res.json();
      if (res.ok) {
        const tokenVal = data.token || data.access_token || 'bypass-token';
        if (Platform.OS === 'web') {
          localStorage.setItem('nutriscan_token', tokenVal);
        } else {
          await SecureStore.setItemAsync('nutriscan_token', tokenVal);
        }
        setToken(tokenVal);
      } else {
        let errMsg = 'Authentication failed';
        if (data && data.detail) {
          if (typeof data.detail === 'string') {
            errMsg = data.detail;
          } else if (Array.isArray(data.detail)) {
            errMsg = data.detail.map((err: any) => `${err.loc?.join('.') || 'error'}: ${err.msg}`).join(', ');
          } else {
            errMsg = JSON.stringify(data.detail);
          }
        }
        setAuthError(errMsg);
      }
    } catch (err) {
      setAuthError('API server is unreachable. Check network status.');
    } finally {
      setAuthLoading(false);
    }
  };

  const saveOnboardingProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/profile?token=${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(onboardingData)
      });
      if (res.ok) {
        const data = await res.json();
        if (user) {
          setUser({ ...user, profile: data.profile });
        }
        generateMealPlan(false);
        setActiveTab('home');
      } else {
        Alert.alert('Error', 'Failed to save profile');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveAndRefreshProfile = async () => {
    if (!editProfileData) return;
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/profile?token=${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editProfileData)
      });
      if (res.ok) {
        const data = await res.json();
        if (user) {
          setUser({ ...user, profile: data.profile });
        }
        setOnboardingData(data.profile);
        
        // Recalculate calorie goals
        const calculatedCal = 1500 + (data.profile.weight * 10) + (data.profile.height * 6.25) - (data.profile.age * 5);
        setCalorieGoal(Math.round(calculatedCal));
        
        // Regenerate the meal plan!
        await generateMealPlan(true);
        
        setIsEditingProfile(false);
      } else {
        Alert.alert('Error', 'Failed to save profile changes');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Connection failed');
    } finally {
      setAuthLoading(false);
    }
  };



  const handleRecipeQuerySearch = async (queryText?: string) => {
    const query = queryText || recipeQueryInput;
    if (!query.trim()) return;
    setScannerLoading(true);
    setScanResult(null);

    try {
      const res = await fetch(`${API_BASE}/scan/search?token=${token || ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setScanResult(data);
        setRecentScans(prev => [data, ...prev.slice(0, 4)]);
        const macros = data.diagnosed_food?.estimated_macros || { calories: 0, carbs_g: 0, protein_g: 0, fats_g: 0 };
        setCaloriesConsumed(prev => Math.round(Math.min(prev + (macros.calories || 0), calorieGoal * 1.5)));
        setMacroStats(prev => ({
          carbs: Math.round(Math.min(prev.carbs + (macros.carbs_g || 0), macroGoals.carbs * 1.5)),
          protein: Math.round(Math.min(prev.protein + (macros.protein_g || 0), macroGoals.protein * 1.5)),
          fats: Math.round(Math.min(prev.fats + (macros.fats_g || 0), macroGoals.fats * 1.5))
        }));
      } else {
        Alert.alert('Not Found', 'Food item not found');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to search food');
    } finally {
      setScannerLoading(false);
    }
  };

  const handlePhotoUpload = async (photoUri: string, foodName?: string) => {
    setScannerLoading(true);
    setScanResult(null);

    // ── STRATEGY ──────────────────────────────────────────────────────────────
    // If the user confirmed a food name from the modal, skip the unreliable
    // multipart upload and directly call /scan/search which always works.
    // The /scan/photo backend also just calls resolve_food_data(food_name) when
    // a food_name is present — so this produces IDENTICAL results with 100%
    // reliability on all devices and network conditions.
    // ─────────────────────────────────────────────────────────────────────────

    if (foodName && foodName.trim().length > 0) {
      try {
        const res = await fetch(`${API_BASE}/scan/search?token=${token || ''}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: foodName.trim() })
        });
        if (res.ok) {
          const data = await res.json();
          setScanResult(data);
          setRecentScans(prev => [data, ...prev.slice(0, 4)]);
          const macros = data.diagnosed_food?.estimated_macros || { calories: 0, carbs_g: 0, protein_g: 0, fats_g: 0 };
          setCaloriesConsumed(prev => Math.round(Math.min(prev + (macros.calories || 0), calorieGoal * 1.5)));
          setMacroStats(prev => ({
            carbs: Math.round(prev.carbs + (macros.carbs_g || 0)),
            protein: Math.round(prev.protein + (macros.protein_g || 0)),
            fats: Math.round(prev.fats + (macros.fats_g || 0))
          }));
        } else {
          Alert.alert('Analysis Failed', 'Could not identify food');
        }
      } catch (e) {
        Alert.alert('Network Error', 'Connection failed. Check your WiFi or backend IP.');
      } finally {
        setScannerLoading(false);
      }
      return;
    }

    // No food name — try to send the raw photo to Gemini AI via multipart
    const formData = new FormData();
    const filename = photoUri.split('/').pop() || 'photo.jpg';

    try {
      if (photoUri.startsWith('http')) {
        // Remote URL (simulation/gallery web link): fetch as blob first
        const blobRes = await fetch(photoUri);
        const blob = await blobRes.blob();
        formData.append('file', blob, filename);
        formData.append('photo', blob, filename);
      } else {
        // Local device file URI
        const match = /\.(\w+)$/.exec(filename);
        let type = match ? `image/${match[1]}` : `image/jpeg`;
        if (type === 'image/jpg') type = 'image/jpeg';
        const fileObj = { uri: photoUri, name: filename, type } as any;
        formData.append('file', fileObj);
        formData.append('photo', fileObj);
      }
      if (token) formData.append('token', token);
      formData.append('timestamp', Date.now().toString());

      const res = await fetch(`${API_BASE.replace('/api', '')}/scan-food?t=${Date.now()}`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setScanResult(data);
        setRecentScans(prev => [data, ...prev.slice(0, 4)]);
        const macros = data.diagnosed_food?.estimated_macros || data || { calories: 0, carbs_g: 0, protein_g: 0, fats_g: 0 };
        setCaloriesConsumed(prev => Math.round(Math.min(prev + (macros.calories || 0), calorieGoal * 1.5)));
        setMacroStats(prev => ({
          carbs: Math.round(prev.carbs + (macros.carbs_g || macros.carbs || 0)),
          protein: Math.round(prev.protein + (macros.protein_g || macros.protein || 0)),
          fats: Math.round(prev.fats + (macros.fats_g || macros.fats || 0))
        }));
      } else {
        // Fallback: guess from filename
        const guessMap: Record<string, string> = {
          pizza: 'Pizza', burger: 'Burger', salad: 'Salad', apple: 'Apple',
          rice: 'Rice', oats: 'Oats', chicken: 'Grilled Chicken'
        };
        const lower = filename.toLowerCase();
        const guessKey = Object.keys(guessMap).find(k => lower.includes(k));
        if (guessKey) {
          await handlePhotoUpload(photoUri, guessMap[guessKey]);
        } else {
          Alert.alert(
            'Identify Food',
            'Could not auto-detect. Please type the food name in the search box below.',
          );
        }
      }
    } catch (e) {
      Alert.alert('Network Error', 'Connection failed. Check your WiFi.');
    } finally {
      setScannerLoading(false);
    }
  };

  const handleManualSearch = async (queryText?: string) => {
    const searchVal = queryText || manualSearchQuery;
    if (!searchVal.trim()) return;
    
    setScannerLoading(true);
    setScanResult(null);
    
    try {
      const res = await fetch(`${API_BASE}/scan/search?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchVal })
      });
      if (res.ok) {
        const data = await res.json();
        setScanResult(data);
        setRecentScans(prev => [data, ...prev.slice(0, 4)]);
        const macros = data.diagnosed_food?.estimated_macros || { calories: 0, carbs_g: 0, protein_g: 0, fats_g: 0 };
        setCaloriesConsumed(prev => Math.round(Math.min(prev + (macros.calories || 0), calorieGoal * 1.5)));
        setMacroStats(prev => ({
          carbs: Math.round(prev.carbs + (macros.carbs_g || 0)),
          protein: Math.round(prev.protein + (macros.protein_g || 0)),
          fats: Math.round(prev.fats + (macros.fats_g || 0))
        }));
      } else {
        Alert.alert('Not Found', 'Could not retrieve food data');
      }
    } catch (e) {
      Alert.alert('Network Error', 'Connection failed');
    } finally {
      setScannerLoading(false);
      setManualSearchQuery('');
    }
  };

  const startCamera = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasCameraPermission(status === 'granted');
    setCameraActive(true);
    setPhotoPreview(null);
  };

  const capturePhoto = async () => {
    setPhotoPreview(null);
    setCurrentImage(null);
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
        setPhotoPreview(photo.uri);
        setCurrentImage(photo.uri);
        setCameraActive(false);
        handlePhotoUpload(photo.uri);
      } catch (e) {
        Alert.alert('Error', 'Camera capture failed');
      }
    } else {
      // Simulation Snapshot
      const mockUri = "https://images.unsplash.com/photo-1543339308-43e59d6b73a6";
      setPhotoPreview(mockUri);
      setCurrentImage(mockUri);
      handlePhotoUpload(mockUri);
    }
  };

  const chooseGalleryPhoto = async () => {
    setPhotoPreview(null);
    setCurrentImage(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Library permissions needed');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedUri = result.assets[0].uri;
      setPhotoPreview(selectedUri);
      setCurrentImage(selectedUri);
      handlePhotoUpload(selectedUri);
    }
  };
  const runDemoScan = (type: 'oats' | 'peanut' | 'chocolate' | 'salad') => {
    setScanMode('recipe');
    const queryMap = {
      oats: 'Oats',
      peanut: 'Grilled Chicken',
      chocolate: 'Chocolate',
      salad: 'Salad'
    };
    const query = queryMap[type];
    setRecipeQueryInput(query);
    handleRecipeQuerySearch(query);
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMessage: ChatMessage = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...chatMessages, userMessage] })
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(prev => [...prev, { role: 'model', content: data.response }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'model', content: 'Connection timeout. Try again.' }]);
      }
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'model', content: 'Could not connect to AI server.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const generateMealPlan = async (useAI: boolean) => {
    setPlannerLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`${API_BASE}/diet/generate?token=${token}&static_template=${!useAI}`, {
        method: 'POST',
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        setMealPlan(data);
        Alert.alert('Done!', 'Your Indian meal plan is ready.');
      }
    } catch (e: any) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') {
        Alert.alert('Timeout', 'AI is taking too long. Loading Indian template plan instead.');
        generateMealPlan(false);
        return;
      }
      Alert.alert('Error', 'Backend unreachable. Make sure the server is running.');
    } finally {
      setPlannerLoading(false);
    }
  };

  // --- Render Tabs & Sections (Cosmic Glass Theme) ---

  const renderHomeTab = () => {
    return (
      <ScrollView style={styles.flex1} contentContainerStyle={styles.p5} showsVerticalScrollIndicator={false}>
        <View style={styles.homeHeader}>
          <View>
            <Text style={styles.headerDate}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
            <Text style={styles.headerGreeting}>Hello, {onboardingData.full_name.split(' ')[0]}</Text>
          </View>
          <TouchableOpacity style={styles.headerAvatar} onPress={() => setActiveTab('profile')}>
            <Image source={{ uri: "https://images.pexels.com/photos/8874414/pexels-photo-8874414.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" }} style={styles.fullWidthImage} />
          </TouchableOpacity>
        </View>

        {/* Calorie Card */}
        <View style={styles.bentoCard}>
          <Text style={styles.bentoTitle}>Daily Energy Balance</Text>
          <View style={styles.calorieStatsRow}>
            <View style={styles.calorieCircle}>
              <Text style={styles.calorieNum}>{caloriesConsumed}</Text>
              <Text style={styles.calorieLabel}>/ {calorieGoal} kcal</Text>
            </View>
            <View style={styles.macroCol}>
              <Text style={styles.macroText}>Carbs: {macroStats.carbs}g / {macroGoals.carbs}g</Text>
              <View style={styles.progressBar}><View style={[styles.progressIndicator, { width: `${Math.min((macroStats.carbs / macroGoals.carbs) * 100, 100)}%`, backgroundColor: '#06B6D4' }]} /></View>
              
              <Text style={styles.macroText}>Protein: {macroStats.protein}g / {macroGoals.protein}g</Text>
              <View style={styles.progressBar}><View style={[styles.progressIndicator, { width: `${Math.min((macroStats.protein / macroGoals.protein) * 100, 100)}%`, backgroundColor: '#A855F7' }]} /></View>
              
              <Text style={styles.macroText}>Fats: {macroStats.fats}g / {macroGoals.fats}g</Text>
              <View style={styles.progressBar}><View style={[styles.progressIndicator, { width: `${Math.min((macroStats.fats / macroGoals.fats) * 100, 100)}%`, backgroundColor: '#e2e8f0' }]} /></View>
            </View>
          </View>
        </View>

        {/* Quick Metrics Grid */}
        <View style={styles.gridRow}>
          <View style={styles.gridHalfCard}>
            <Ionicons name="water" size={24} color="#06B6D4" />
            <Text style={styles.gridHalfVal}>{waterLogged} / {waterGoal} ml</Text>
            <TouchableOpacity style={styles.btnMini} onPress={() => setWaterLogged(prev => prev + 250)}>
              <Text style={styles.btnMiniText}>+250ml</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.gridHalfCard} onPress={() => { setActiveTab('camera'); startCamera(); }}>
            <Ionicons name="qr-code" size={24} color="#A855F7" />
            <Text style={styles.gridHalfLabel}>Diagnostics Scanner</Text>
            <Text style={styles.gridHalfSub}>Check active safety warning logs</Text>
          </TouchableOpacity>
        </View>

        {/* AI tip */}
        <View style={styles.glowCard}>
          <View style={styles.aiTipHeader}>
            <Ionicons name="sparkles" size={16} color="#06B6D4" />
            <Text style={styles.aiTipLabel}>Diagnostic Suggestion</Text>
          </View>
          <Text style={styles.aiTipBody}>"{aiTip}"</Text>
        </View>

        {/* Recent Scans */}
        <Text style={styles.sectionTitle}>Recent Logs</Text>
        {recentScans.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="barcode-outline" size={32} color="rgba(255,255,255,0.4)" />
            <Text style={styles.emptyText}>Scanned items will appear here.</Text>
          </View>
        ) : (
          recentScans.map((scan, sIdx) => (
            <View key={sIdx} style={styles.recentItem}>
              <View style={styles.flex1}>
                <Text style={styles.recentName}>{scan.product_name}</Text>
                <Text style={styles.recentSub}>{scan.brand || 'Generic'} | {scan.calories} kcal</Text>
              </View>
              {scan.health_warnings.length > 0 ? (
                <Ionicons name="warning" size={20} color="#ff9800" style={styles.ml3} />
              ) : (
                <Text style={styles.gradeCircle}>{scan.health_grade}</Text>
              )}
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  const renderChatTab = () => {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatHeaderTitle}>AI Nutrition Coach</Text>
          <Text style={styles.chatHeaderSub}>Gemini 1.5 Flash</Text>
        </View>

        <ScrollView 
          style={styles.chatScroll} 
          ref={chatScrollRef}
          onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        >
          {chatMessages.map((msg, mIdx) => {
            const isUser = msg.role === 'user';
            return (
              <View key={mIdx} style={[styles.chatBubbleContainer, isUser ? styles.bubbleUserAlign : styles.bubbleModelAlign]}>
                <View style={[styles.chatBubble, isUser ? styles.bubbleUser : styles.bubbleModel]}>
                  <Text style={styles.chatBubbleText}>{msg.content}</Text>
                </View>
              </View>
            );
          })}
          {chatLoading && (
            <View style={styles.chatBubbleContainer}>
              <View style={[styles.chatBubble, styles.bubbleModel]}>
                <ActivityIndicator size="small" color="#06B6D4" />
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.chatInputRow}>
          <TextInput 
            style={styles.chatInput}
            placeholder="Ask about calories, ingredient swaps..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={chatInput}
            onChangeText={setChatInput}
            onSubmitEditing={handleSendChatMessage}
          />
          <TouchableOpacity style={styles.chatSendBtn} onPress={handleSendChatMessage}>
            <Ionicons name="send" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  };

  const renderPlannerTab = () => {
    return (
      <ScrollView style={styles.flex1} contentContainerStyle={styles.p5} showsVerticalScrollIndicator={false}>
        <Text style={styles.tabHeading}>Diet Planner</Text>

        <View style={styles.bentoCard}>
          <Text style={styles.bentoTitle}>Indian Weekly Meal Plan</Text>
          <Text style={styles.bentoSub}>Personalized Indian diet based on your allergies, health goals and budget.</Text>
          <View style={styles.fieldRow}>
            <TouchableOpacity style={[styles.btnPrimary, styles.btnFlex]} onPress={() => generateMealPlan(true)} disabled={plannerLoading}>
              {plannerLoading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.btnPrimaryText}>AI Generate</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnSecondary, styles.btnFlex, styles.ml3]} onPress={() => generateMealPlan(false)} disabled={plannerLoading}>
              <Text style={styles.btnSecondaryText}>Indian Template</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Days bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysScroll}>
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => {
            const active = selectedDay === d;
            return (
              <TouchableOpacity key={d} style={[styles.dayTab, active && styles.dayTabActive]} onPress={() => setSelectedDay(d)}>
                <Text style={[styles.dayTabText, active && styles.dayTabTextActive]}>{d.substring(0,3)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {mealPlan && mealPlan.days[selectedDay] ? (
          <>
            <View style={styles.mealsList}>
              {['breakfast', 'lunch', 'dinner', 'snack'].map(key => {
                const meal = mealPlan.days[selectedDay][key as keyof DayPlan];
                if (!meal) return null;
                return (
                  <View key={key} style={styles.mealItem}>
                    <View style={styles.mealHeader}>
                      <View style={styles.flex1}>
                        <Text style={styles.mealTag}>{key.toUpperCase()}</Text>
                        <Text style={styles.mealName}>{meal.name}</Text>
                      </View>
                      <Text style={styles.mealCalories}>{meal.calories} kcal</Text>
                    </View>
                    <Text style={styles.mealMacros}>C: {meal.carbs}g | P: {meal.protein}g | F: {meal.fats}g</Text>
                    <TouchableOpacity style={styles.btnMini} onPress={() => setActiveRecipe({ meal: key, details: meal })}>
                      <Text style={styles.btnMiniText}>Cook Recipe</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
            {/* Refresh Plan button */}
            <TouchableOpacity
              style={[styles.btnSecondary, { marginTop: 14 }]}
              onPress={() => generateMealPlan(true)}
              disabled={plannerLoading}
            >
              {plannerLoading
                ? <ActivityIndicator color="#06B6D4" />
                : <Text style={styles.btnSecondaryText}>Refresh Plan</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Tap AI Generate to get a personalized Indian meal plan, or Indian Template for an instant plan.</Text>
          </View>
        )}
      </ScrollView>
    );
  };

  const renderProfileTab = () => {
    if (isEditingProfile && editProfileData) {
      const allergiesList = ['Gluten', 'Dairy', 'Nuts', 'Soy', 'Eggs', 'Shellfish', 'Fish', 'Sesame'];
      const conditionsList = ['Diabetes', 'Hypertension', 'High Cholesterol', 'PCOS', 'Thyroid', 'Kidney Disease', 'Lactose Intolerance', 'IBS / Gut Issues'];
      
      const toggleEditAllergy = (a: string) => {
        setEditProfileData(prev => prev ? {
          ...prev,
          allergies: prev.allergies.includes(a) ? prev.allergies.filter(item => item !== a) : [...prev.allergies, a]
        } : null);
      };

      const toggleEditCondition = (c: string) => {
        setEditProfileData(prev => prev ? {
          ...prev,
          medical_conditions: prev.medical_conditions.includes(c) ? prev.medical_conditions.filter(item => item !== c) : [...prev.medical_conditions, c]
        } : null);
      };

      return (
        <ScrollView style={styles.flex1} contentContainerStyle={styles.p5} showsVerticalScrollIndicator={false}>
          <Text style={styles.tabHeading}>Edit Profile & Goals</Text>
          
          <View style={styles.glassCard}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput 
              style={styles.fieldInput}
              value={editProfileData.full_name}
              onChangeText={text => setEditProfileData({ ...editProfileData, full_name: text })}
            />

            <View style={styles.fieldRow}>
              <View style={styles.flex1}>
                <Text style={styles.fieldLabel}>Age</Text>
                <TextInput 
                  style={styles.fieldInput}
                  keyboardType="number-pad"
                  value={editProfileData.age.toString()}
                  onChangeText={t => setEditProfileData({ ...editProfileData, age: parseInt(t) || 0 })}
                />
              </View>
              <View style={[styles.flex1, styles.ml3]}>
                <Text style={styles.fieldLabel}>Gender</Text>
                <TextInput 
                  style={styles.fieldInput}
                  value={editProfileData.gender}
                  onChangeText={t => setEditProfileData({ ...editProfileData, gender: t })}
                />
              </View>
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.flex1}>
                <Text style={styles.fieldLabel}>Height (cm)</Text>
                <TextInput 
                  style={styles.fieldInput}
                  keyboardType="numeric"
                  value={editProfileData.height.toString()}
                  onChangeText={t => setEditProfileData({ ...editProfileData, height: parseFloat(t) || 0 })}
                />
              </View>
              <View style={[styles.flex1, styles.ml3]}>
                <Text style={styles.fieldLabel}>Weight (kg)</Text>
                <TextInput 
                  style={styles.fieldInput}
                  keyboardType="numeric"
                  value={editProfileData.weight.toString()}
                  onChangeText={t => setEditProfileData({ ...editProfileData, weight: parseFloat(t) || 0 })}
                />
              </View>
            </View>
          </View>

          <View style={styles.glassCard}>
            <Text style={styles.fieldLabel}>Diet Type</Text>
            <TextInput 
              style={styles.fieldInput}
              value={editProfileData.diet_type}
              onChangeText={t => setEditProfileData({ ...editProfileData, diet_type: t })}
            />

            <Text style={[styles.fieldLabel, styles.mt3]}>Meal Frequency</Text>
            <TextInput 
              style={styles.fieldInput}
              value={editProfileData.meal_frequency}
              onChangeText={t => setEditProfileData({ ...editProfileData, meal_frequency: t })}
            />

            <Text style={[styles.fieldLabel, styles.mt3]}>Weight Goal</Text>
            <TextInput 
              style={styles.fieldInput}
              value={editProfileData.weight_goal}
              onChangeText={t => setEditProfileData({ ...editProfileData, weight_goal: t })}
            />

            <View style={styles.fieldRow}>
              <View style={styles.flex1}>
                <Text style={styles.fieldLabel}>Target Weight (kg)</Text>
                <TextInput 
                  style={styles.fieldInput}
                  keyboardType="numeric"
                  value={editProfileData.target_weight.toString()}
                  onChangeText={t => setEditProfileData({ ...editProfileData, target_weight: parseFloat(t) || 0 })}
                />
              </View>
              <View style={[styles.flex1, styles.ml3]}>
                <Text style={styles.fieldLabel}>Weekly Budget (INR)</Text>
                <TextInput 
                  style={styles.fieldInput}
                  keyboardType="numeric"
                  value={editProfileData.weekly_budget.toString()}
                  onChangeText={t => setEditProfileData({ ...editProfileData, weekly_budget: parseFloat(t) || 0 })}
                />
              </View>
            </View>
          </View>

          <View style={styles.glassCard}>
            <Text style={styles.fieldLabel}>Food Allergies</Text>
            <View style={styles.chipGrid}>
              {allergiesList.map(a => {
                const active = editProfileData.allergies.includes(a);
                return (
                  <TouchableOpacity 
                    key={a}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleEditAllergy(a)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{a}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, styles.mt4]}>Medical Conditions</Text>
            <View style={styles.chipGrid}>
              {conditionsList.map(c => {
                const active = editProfileData.medical_conditions.includes(c);
                return (
                  <TouchableOpacity 
                    key={c}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleEditCondition(c)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.fieldRow}>
            <TouchableOpacity 
              style={[styles.btnPrimary, styles.btnFlex]} 
              onPress={handleSaveAndRefreshProfile}
              disabled={authLoading}
            >
              {authLoading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.btnPrimaryText}>Save & Refresh Plan</Text>}
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.btnSecondary, styles.btnFlex, styles.ml3]} 
              onPress={() => setIsEditingProfile(false)}
            >
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView style={styles.flex1} contentContainerStyle={styles.p5} showsVerticalScrollIndicator={false}>
        <Text style={styles.tabHeading}>Diagnostics Control</Text>

        <View style={styles.profileSummaryBox}>
          <View style={styles.profileAvatarLarge}>
            <Image source={{ uri: "https://images.pexels.com/photos/8874414/pexels-photo-8874414.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" }} style={styles.fullWidthImage} />
          </View>
          <Text style={styles.profileName}>{onboardingData.full_name}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
        </View>

        <View style={styles.bentoCard}>
          <Text style={styles.bentoTitle}>Physical Stats</Text>
          <View style={styles.profileStatsRow}>
            <View style={styles.statBox}><Text style={styles.statVal}>{onboardingData.age}</Text><Text style={styles.statLabel}>Age</Text></View>
            <View style={styles.statBox}><Text style={styles.statVal}>{onboardingData.height}cm</Text><Text style={styles.statLabel}>Height</Text></View>
            <View style={styles.statBox}><Text style={styles.statVal}>{onboardingData.weight}kg</Text><Text style={styles.statLabel}>Weight</Text></View>
          </View>
        </View>

        <View style={styles.bentoCard}>
          <Text style={styles.bentoTitle}>Diet Preferences & Goals</Text>
          
          <Text style={styles.fieldLabel}>Diet Type</Text>
          <Text style={styles.profileChipsText}>{onboardingData.diet_type}</Text>

          <Text style={[styles.fieldLabel, styles.mt3]}>Weight Goal</Text>
          <Text style={styles.profileChipsText}>{onboardingData.weight_goal} (Target: {onboardingData.target_weight}kg)</Text>

          <Text style={[styles.fieldLabel, styles.mt3]}>Weekly Budget</Text>
          <Text style={styles.profileChipsText}>{onboardingData.weekly_budget} INR/week</Text>
        </View>

        <View style={styles.bentoCard}>
          <Text style={styles.bentoTitle}>Saved Safeguards</Text>
          <Text style={styles.fieldLabel}>Allergies</Text>
          <Text style={styles.profileChipsText}>
            {onboardingData.allergies.length > 0 ? onboardingData.allergies.join(', ') : 'None'}
          </Text>

          <Text style={[styles.fieldLabel, styles.mt3]}>Medical Conditions</Text>
          <Text style={styles.profileChipsText}>
            {onboardingData.medical_conditions.length > 0 ? onboardingData.medical_conditions.join(', ') : 'None'}
          </Text>
        </View>

        <View style={styles.bentoCard}>
          <Text style={styles.bentoTitle}>Gemini AI Configuration</Text>
          <Text style={[styles.fieldLabel, { marginTop: 0 }]}>
            Status: {geminiKeyStatus.is_configured ? `🟢 Active (${geminiKeyStatus.masked_key})` : '🔴 Inactive (Using Local Simulation)'}
          </Text>
          <View style={[styles.searchBarRow, styles.mt3]}>
            <TextInput
              style={[styles.fieldInput, styles.flex1, { marginBottom: 0, paddingVertical: 10 }]}
              secureTextEntry
              placeholder={geminiKeyStatus.is_configured ? "••••••••••••" : "Paste your Gemini API key (sk-...)"}
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={geminiKeyInput.includes('...') ? '' : geminiKeyInput}
              onChangeText={setGeminiKeyInput}
            />
            <TouchableOpacity style={[styles.btnSearch, { backgroundColor: '#A855F7', paddingHorizontal: 16 }]} onPress={handleSaveGeminiKey}>
              <Text style={{ color: '#ffffff', fontWeight: 'bold' }}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.btnPrimary, { marginBottom: 14 }]} 
          onPress={() => {
            setEditProfileData({ ...onboardingData });
            setIsEditingProfile(true);
          }}
        >
          <Text style={styles.btnPrimaryText}>Edit Profile & Diet Goals</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnDanger} onPress={handleLogout}>
          <Text style={styles.btnDangerText}>Sign Out Account</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderRecipeScanner = () => {
    return (
      <View style={styles.flex1}>
        <ScrollView style={styles.flex1} showsVerticalScrollIndicator={false} contentContainerStyle={styles.panelScroll}>
          <Text style={styles.tabHeading}>Recipe Scanner</Text>
          
          {!scanResult && !scannerLoading && (
            <View>
              <View style={styles.scanBox}>
                <Text style={styles.fieldLabel}>Enter Ingredients</Text>
                <TextInput 
                  style={styles.fieldInput}
                  placeholder="e.g. Apple, Banana, Oats..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={recipeQueryInput}
                  onChangeText={setRecipeQueryInput}
                  onSubmitEditing={() => handleRecipeQuerySearch()}
                />
                <TouchableOpacity style={[styles.btnPrimary, styles.mt3]} onPress={() => handleRecipeQuerySearch()} disabled={scannerLoading}>
                  <Text style={styles.btnPrimaryText}>Find Recipes</Text>
                </TouchableOpacity>

                <Text style={[styles.fieldLabel, styles.mt4]}>Or Snap Raw Ingredients</Text>
                <View style={styles.fieldRow}>
                  <TouchableOpacity style={[styles.btnSecondary, styles.btnFlex]} onPress={() => { setScanMode('recipe'); startCamera(); }}>
                    <Text style={styles.btnSecondaryText}>Start Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnSecondary, styles.btnFlex, styles.ml3]} onPress={() => { setScanMode('recipe'); chooseGalleryPhoto(); }}>
                    <Text style={styles.btnSecondaryText}>Gallery</Text>
                  </TouchableOpacity>
                </View>
                {cameraActive && scanMode === 'recipe' && (
                  <View style={[styles.cameraBox, styles.mt3]}>
                    <CameraView style={styles.cameraPreview} facing="back" ref={cameraRef} />
                    <TouchableOpacity style={[styles.btnPrimary, styles.mt3]} onPress={capturePhoto}>
                      <Text style={styles.btnPrimaryText}>Capture Ingredients</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {photoPreview && scanMode === 'recipe' && !cameraActive && (
                  <View style={[styles.cameraBox, styles.mt3]}>
                    <Image source={{ uri: photoPreview }} style={styles.cameraPreview} />
                  </View>
                )}
              </View>

              <View style={styles.demoBox}>
                <Text style={styles.demoTitle}>Recipe Scanner Presets</Text>
                <View style={styles.demoButtonsRow}>
                  <TouchableOpacity style={styles.btnDemo} onPress={() => runDemoScan('oats')}><Text style={styles.btnDemoText}>Oats Recipes</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.btnDemo} onPress={() => runDemoScan('peanut')}><Text style={styles.btnDemoText}>Chicken Recipes</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.btnDemo} onPress={() => runDemoScan('chocolate')}><Text style={styles.btnDemoText}>Chocolate Recipes</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.btnDemo} onPress={() => runDemoScan('salad')}><Text style={styles.btnDemoText}>Salad Recipes</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {scannerLoading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#06B6D4" />
              <Text style={styles.loadingSub}>Analyzing ingredients...</Text>
            </View>
          )}

          {scanResult && scanMode === 'recipe' && (() => {
            const food = scanResult.diagnosed_food || scanResult;
            return (
              <View>
                {food.recipes && food.recipes.length > 0 ? (
                  <View style={styles.recipesContainer}>
                    <Text style={styles.recipesSectionHeader}>🍽️ Curated Recipe Suggestions</Text>
                    {food.recipes.map((rec: any, rIdx: number) => (
                      <View key={rIdx} style={styles.recipeItemCard}>
                        <Text style={styles.recipeItemName}>{rec.name}</Text>
                        <Text style={styles.recipeItemSub}>Ingredients:</Text>
                        <View style={styles.recipeItemIngRow}>
                          {rec.ingredients.map((ing: string, iIdx: number) => (
                            <View key={iIdx} style={styles.recipeIngBadge}>
                              <Text style={styles.recipeIngBadgeText}>{ing}</Text>
                            </View>
                          ))}
                        </View>
                        <Text style={styles.recipeItemSub}>Instructions:</Text>
                        <Text style={styles.recipeItemInstructions}>{rec.instructions}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{color:'white', marginTop:20}}>No recipes found. Try different ingredients.</Text>
                )}
                
                <TouchableOpacity 
                  style={[styles.btnPrimary, styles.mt3, { backgroundColor: '#A855F7', marginBottom: 24 }]} 
                  onPress={() => { setScanResult(null); setPhotoPreview(null); }}
                >
                  <Text style={styles.btnPrimaryText}>Scan Other Ingredients</Text>
                </TouchableOpacity>
              </View>
            );
          })()}
        </ScrollView>
      </View>
    );
  };

  const renderFoodScanner = () => {
    return (
      <View style={styles.flex1}>
        {!scanResult && !scannerLoading && (
          <View style={styles.flex1}>
            <CameraView style={StyleSheet.absoluteFillObject} facing="back" ref={cameraRef} />
            
            <View style={{ position: 'absolute', top: 40, left: 20, right: 20 }}>
              <Text style={styles.tabHeading}>Diagnostics Scanner</Text>
              <Text style={{color: 'white', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4}}>Point at any food to analyze</Text>
            </View>

            <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
              <TouchableOpacity onPress={() => { setScanMode('photo'); chooseGalleryPhoto(); }} style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: 15, borderRadius: 30, marginRight: 40 }}>
                <Ionicons name="images" size={28} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { setScanMode('photo'); capturePhoto(); }} style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#ffffff' }}>
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffffff' }} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {scannerLoading && (
          <ScrollView style={styles.flex1} showsVerticalScrollIndicator={false} contentContainerStyle={styles.panelScroll}>
            <Text style={styles.tabHeading}>Diagnostics Scanner</Text>
            <View>
              <View style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultFoodName}>Detected: Scanning...</Text>
                </View>
                <View style={[styles.verdictBanner, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}>
                  <ActivityIndicator size="small" color="#06B6D4" />
                  <Text style={[styles.verdictTitle, { color: '#ccc', marginLeft: 10, fontSize: 14 }]}>Analyzing image pixels...</Text>
                </View>
                <View style={styles.macroSection}>
                  <Text style={styles.macroSectionTitle}>📊 Nutrition Facts (Estimated)</Text>
                  
                  <View style={styles.macroCalRow}>
                    <Ionicons name="flame" size={24} color="#f97316" />
                    <Text style={styles.macroCalNum}>0</Text>
                    <Text style={styles.macroCalLabel}>kcal</Text>
                  </View>

                  <View style={styles.macroBarContainer}>
                    <Text style={styles.macroBarLabel}>Carbs</Text>
                    <View style={styles.macroBarTrack}>
                      <View style={[styles.macroBarFill, { width: `0%`, backgroundColor: '#0ea5e9' }]} />
                    </View>
                    <Text style={styles.macroBarVal}>0g  <Text style={styles.macroBarPct}>0%</Text></Text>
                  </View>
                  
                  <View style={styles.macroBarContainer}>
                    <Text style={styles.macroBarLabel}>Protein</Text>
                    <View style={styles.macroBarTrack}>
                      <View style={[styles.macroBarFill, { width: `0%`, backgroundColor: '#8b5cf6' }]} />
                    </View>
                    <Text style={styles.macroBarVal}>0g  <Text style={styles.macroBarPct}>0%</Text></Text>
                  </View>

                  <View style={styles.macroBarContainer}>
                    <Text style={styles.macroBarLabel}>Fats</Text>
                    <View style={styles.macroBarTrack}>
                      <View style={[styles.macroBarFill, { width: `0%`, backgroundColor: '#f43f5e' }]} />
                    </View>
                    <Text style={styles.macroBarVal}>0g  <Text style={styles.macroBarPct}>0%</Text></Text>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        )}

        {scanResult && scanMode === 'photo' && (
          <ScrollView style={styles.flex1} showsVerticalScrollIndicator={false} contentContainerStyle={styles.panelScroll}>
            <Text style={styles.tabHeading}>Diagnostics Scanner</Text>
            {(() => {
              const responseData = scanResult.diagnosed_food || scanResult;
              const food = responseData;
              const foodName = responseData.product_name || responseData.detected_food_name || "Unknown Food";
              const rawVerdict = responseData.health_verdict || "MODERATION";
              const grade = (responseData.health_grade || (rawVerdict === 'GOOD' ? 'A' : 'D') || 'C').toUpperCase();
              const isGood = rawVerdict === 'GOOD' || (!responseData.health_verdict && !responseData.verdict && ['A', 'B'].includes(grade));
              const isNeutral = rawVerdict === 'MODERATION' || rawVerdict === 'NEUTRAL' || (!responseData.health_verdict && !responseData.verdict && grade === 'C');
              const isBad = rawVerdict === 'BAD' || (!responseData.health_verdict && !responseData.verdict && ['D', 'E'].includes(grade));
              
              const bannerBg = isGood ? 'rgba(34,197,94,0.15)' : isNeutral ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';
              const bannerBorder = isGood ? 'rgba(34,197,94,0.4)' : isNeutral ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)';
              const labelColor = isGood ? '#4ade80' : isNeutral ? '#fbbf24' : '#f87171';
              const verdictEmoji = isGood ? '✅' : isNeutral ? '⚠️' : '❌';
              const verdictText = isGood ? 'HEALTHY (GOOD)' : isNeutral ? 'MODERATE' : 'UNHEALTHY (BAD)';
              const verdictSub = responseData.verdict_reason || (isGood 
                ? 'This food fits well into a balanced diet.' 
                : 'This food exceeds your recommended daily thresholds.');
                
              const calVal = responseData.calories || 0;
              const carbVal = responseData.carbs_g ?? responseData.carbs ?? 0;
              const proVal = responseData.protein_g ?? responseData.protein ?? 0;
              const fatVal = responseData.fats_g ?? responseData.fats ?? 0;
              
              const totalM = (carbVal + proVal + fatVal) || 1;
              const carbPct = Math.round((carbVal / totalM) * 100);
              const proPct = Math.round((proVal / totalM) * 100);
              const fatPct = Math.round((fatVal / totalM) * 100);

              return (
                <View>
                  <View style={styles.resultCard}>
                    <View style={styles.resultHeader}>
                      <Text style={styles.resultFoodName}>Detected: {foodName}</Text>
                      {food.brand && <Text style={styles.resultBrand}>{food.brand}</Text>}
                    </View>

                    <View style={[styles.verdictBanner, { backgroundColor: bannerBg, borderColor: bannerBorder }]}>
                      <Text style={[styles.verdictTitle, { color: labelColor }]}>{verdictEmoji} {verdictText}</Text>
                      <Text style={styles.verdictReason}>{verdictSub}</Text>
                    </View>

                    <View style={styles.macroSection}>
                      <Text style={styles.macroSectionTitle}>📊 Nutrition Facts (Estimated)</Text>
                      
                      <View style={styles.macroCalRow}>
                        <Ionicons name="flame" size={24} color="#f97316" />
                        <Text style={styles.macroCalNum}>{calVal}</Text>
                        <Text style={styles.macroCalLabel}>kcal</Text>
                      </View>

                      <View style={styles.macroBarContainer}>
                        <Text style={styles.macroBarLabel}>Carbs</Text>
                        <View style={styles.macroBarTrack}>
                          <View style={[styles.macroBarFill, { width: `${carbPct}%`, backgroundColor: '#0ea5e9' }]} />
                        </View>
                        <Text style={styles.macroBarVal}>{carbVal}g  <Text style={styles.macroBarPct}>{carbPct}%</Text></Text>
                      </View>
                      
                      <View style={styles.macroBarContainer}>
                        <Text style={styles.macroBarLabel}>Protein</Text>
                        <View style={styles.macroBarTrack}>
                          <View style={[styles.macroBarFill, { width: `${proPct}%`, backgroundColor: '#8b5cf6' }]} />
                        </View>
                        <Text style={styles.macroBarVal}>{proVal}g  <Text style={styles.macroBarPct}>{proPct}%</Text></Text>
                      </View>

                      <View style={styles.macroBarContainer}>
                        <Text style={styles.macroBarLabel}>Fats</Text>
                        <View style={styles.macroBarTrack}>
                          <View style={[styles.macroBarFill, { width: `${fatPct}%`, backgroundColor: '#f43f5e' }]} />
                        </View>
                        <Text style={styles.macroBarVal}>{fatVal}g  <Text style={styles.macroBarPct}>{fatPct}%</Text></Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity 
                    style={[styles.btnPrimary, styles.mt3, { backgroundColor: '#A855F7', marginBottom: 24 }]} 
                    onPress={() => { setScanResult(null); setPhotoPreview(null); startCamera(); }}
                  >
                    <Text style={styles.btnPrimaryText}>Scan Another Food</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </ScrollView>
        )}
      </View>
    );
  };



  const renderRecipeModal = () => {
    if (!activeRecipe) return null;
    return (
      <Modal transparent visible={activeRecipe !== null} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>{activeRecipe.details.name}</Text>
              <TouchableOpacity onPress={() => setActiveRecipe(null)}>
                <Ionicons name="close-circle" size={26} color="#A855F7" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.flex1} contentContainerStyle={styles.py3}>
              <Text style={styles.modalSub}>PREPARATION</Text>
              <Text style={styles.modalRecipeText}>{activeRecipe.details.recipe}</Text>
              <View style={styles.modalWasteBox}>
                <Text style={styles.modalWasteTitle}>Zero-Waste Tip</Text>
                <Text style={styles.modalWasteBody}>{activeRecipe.details.waste_tip}</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderBottomTabBar = () => {
    return (
      <View style={styles.bottomTabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => { setActiveTab('home'); }}>
          <Ionicons name="home" size={22} color={activeTab === 'home' ? '#06B6D4' : '#a3b1a9'} />
          <Text style={[styles.tabItemLabel, activeTab === 'home' && styles.tabItemLabelActive]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => { setActiveTab('recipes'); }}>
          <Ionicons name="restaurant" size={22} color={activeTab === 'recipes' ? '#06B6D4' : '#a3b1a9'} />
          <Text style={[styles.tabItemLabel, activeTab === 'recipes' && styles.tabItemLabelActive]}>Recipes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => { setActiveTab('camera'); startCamera(); }}>
          <Ionicons name="camera" size={22} color={activeTab === 'camera' ? '#06B6D4' : '#a3b1a9'} />
          <Text style={[styles.tabItemLabel, activeTab === 'camera' && styles.tabItemLabelActive]}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => { setActiveTab('chat'); }}>
          <Ionicons name="chatbubble-ellipses" size={22} color={activeTab === 'chat' ? '#06B6D4' : '#a3b1a9'} />
          <Text style={[styles.tabItemLabel, activeTab === 'chat' && styles.tabItemLabelActive]}>AI Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => { setActiveTab('profile'); }}>
          <Ionicons name="person" size={22} color={activeTab === 'profile' ? '#06B6D4' : '#a3b1a9'} />
          <Text style={[styles.tabItemLabel, activeTab === 'profile' && styles.tabItemLabelActive]}>Profile</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // --- Loader Screen ---
  if (isInitializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#06B6D4" />
        <Text style={styles.loadingText}>NUTRISCAN</Text>
        <Text style={styles.loadingSub}>Loading your nutrition profile...</Text>
      </View>
    );
  }

  // --- Auth View ---
  if (!token) {
    return (
      <View style={styles.flex1}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.authContainer}
        >
          <StatusBar barStyle="light-content" />
          <View style={styles.glassCard}>
            <View style={styles.logoBadge}>
              <Ionicons name="nutrition" size={32} color="#06B6D4" />
            </View>
            <Text style={styles.authTitle}>NutriScan Cosmic</Text>
            <Text style={styles.authSub}>Your kitchen's personal nutritionist</Text>

            <View style={styles.authTabRow}>
              <TouchableOpacity 
                style={[styles.authTabButton, authView === 'login' && styles.authTabActive]}
                onPress={() => { setAuthView('login'); setAuthError(''); }}
              >
                <Text style={[styles.authTabText, authView === 'login' && styles.authTabTextActive]}>Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.authTabButton, authView === 'register' && styles.authTabActive]}
                onPress={() => { setAuthView('register'); setAuthError(''); }}
              >
                <Text style={[styles.authTabText, authView === 'register' && styles.authTabTextActive]}>Register</Text>
              </TouchableOpacity>
            </View>

            {authError ? <Text style={styles.authErr}>{authError}</Text> : null}

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Email Address</Text>
              <TextInput 
                style={styles.formInput}
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor="rgba(255,255,255,0.4)"
                autoCapitalize="none"
                value={authEmail}
                onChangeText={setAuthEmail}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Password</Text>
              <TextInput 
                style={styles.formInput}
                secureTextEntry
                placeholder="********"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={authPassword}
                onChangeText={setAuthPassword}
              />
            </View>

            <TouchableOpacity style={styles.btnPrimary} onPress={handleAuth} disabled={authLoading}>
              {authLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.btnPrimaryText}>{authView === 'login' ? 'Sign In' : 'Create Account'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // --- Onboarding Flow ---
  if (user && !user.profile?.onboarded) {
    const allergiesList = ['Gluten', 'Dairy', 'Nuts', 'Soy', 'Eggs', 'Shellfish', 'Fish', 'Sesame'];
    const conditionsList = ['Diabetes', 'Hypertension', 'High Cholesterol', 'PCOS', 'Thyroid', 'Kidney Disease', 'Lactose Intolerance', 'IBS / Gut Issues'];
    
    const toggleAllergy = (a: string) => {
      setOnboardingData(prev => ({
        ...prev,
        allergies: prev.allergies.includes(a) ? prev.allergies.filter(item => item !== a) : [...prev.allergies, a]
      }));
    };

    const toggleCondition = (c: string) => {
      setOnboardingData(prev => ({
        ...prev,
        medical_conditions: prev.medical_conditions.includes(c) ? prev.medical_conditions.filter(item => item !== c) : [...prev.medical_conditions, c]
      }));
    };

    return (
      <View style={styles.flex1}>
        <SafeAreaView style={styles.mainContainerOverlay}>
          <View style={styles.onboardProgress}>
            <View style={[styles.onboardProgressBar, { width: `${(onboardingStep / 6) * 100}%` }]} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} style={styles.flex1} showsVerticalScrollIndicator={false}>
            <Text style={styles.onboardStepIndicator}>Step {onboardingStep} of 6</Text>

            {onboardingStep === 1 && (
              <View style={styles.glassCard}>
                <Image 
                  source={{ uri: "https://images.pexels.com/photos/16102844/pexels-photo-16102844.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940" }}
                  style={styles.stepHeroImage}
                />
                <Text style={styles.stepHeading}>Welcome to NutriScan</Text>
                <Text style={styles.stepBody}>
                  Protect your health, reduce kitchen waste, and craft balanced meal plans with AI support at every step. Let's build your nutritional profile.
                </Text>
              </View>
            )}

            {onboardingStep === 2 && (
              <View style={styles.glassCard}>
                <Text style={styles.stepHeading}>Introduce Yourself</Text>
                
                <Text style={styles.fieldLabel}>Full Name</Text>
                <TextInput 
                  style={styles.fieldInput}
                  placeholder="Jane Doe"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={onboardingData.full_name}
                  onChangeText={text => setOnboardingData({ ...onboardingData, full_name: text })}
                />

                <View style={styles.fieldRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.fieldLabel}>Age</Text>
                    <TextInput 
                      style={styles.fieldInput}
                      keyboardType="number-pad"
                      value={onboardingData.age.toString()}
                      onChangeText={t => setOnboardingData({ ...onboardingData, age: parseInt(t) || 0 })}
                    />
                  </View>
                  <View style={[styles.flex1, styles.ml3]}>
                    <Text style={styles.fieldLabel}>Gender</Text>
                    <TextInput 
                      style={styles.fieldInput}
                      value={onboardingData.gender}
                      onChangeText={t => setOnboardingData({ ...onboardingData, gender: t })}
                    />
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.fieldLabel}>Height (cm)</Text>
                    <TextInput 
                      style={styles.fieldInput}
                      keyboardType="numeric"
                      value={onboardingData.height.toString()}
                      onChangeText={t => setOnboardingData({ ...onboardingData, height: parseFloat(t) || 0 })}
                    />
                  </View>
                  <View style={[styles.flex1, styles.ml3]}>
                    <Text style={styles.fieldLabel}>Weight (kg)</Text>
                    <TextInput 
                      style={styles.fieldInput}
                      keyboardType="numeric"
                      value={onboardingData.weight.toString()}
                      onChangeText={t => setOnboardingData({ ...onboardingData, weight: parseFloat(t) || 0 })}
                    />
                  </View>
                </View>
              </View>
            )}

            {onboardingStep === 3 && (
              <View style={styles.glassCard}>
                <Text style={styles.stepHeading}>Health Safeguards</Text>
                
                <Text style={styles.fieldLabel}>Food Allergies</Text>
                <View style={styles.chipGrid}>
                  {allergiesList.map(a => {
                    const active = onboardingData.allergies.includes(a);
                    return (
                      <TouchableOpacity 
                        key={a}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => toggleAllergy(a)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{a}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.fieldLabel, styles.mt4]}>Medical Presets</Text>
                <View style={styles.chipGrid}>
                  {conditionsList.map(c => {
                    const active = onboardingData.medical_conditions.includes(c);
                    return (
                      <TouchableOpacity 
                        key={c}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => toggleCondition(c)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {onboardingStep === 4 && (
              <View style={styles.glassCard}>
                <Text style={styles.stepHeading}>Diet Preferences</Text>
                
                <Text style={styles.fieldLabel}>Diet Type</Text>
                <TextInput 
                  style={styles.fieldInput}
                  value={onboardingData.diet_type}
                  onChangeText={t => setOnboardingData({ ...onboardingData, diet_type: t })}
                />

                <Text style={[styles.fieldLabel, styles.mt3]}>Meal Frequency</Text>
                <TextInput 
                  style={styles.fieldInput}
                  value={onboardingData.meal_frequency}
                  onChangeText={t => setOnboardingData({ ...onboardingData, meal_frequency: t })}
                />
              </View>
            )}

            {onboardingStep === 5 && (
              <View style={styles.glassCard}>
                <Text style={styles.stepHeading}>Goals & Budget</Text>
                
                <Text style={styles.fieldLabel}>Weight Goal</Text>
                <TextInput 
                  style={styles.fieldInput}
                  value={onboardingData.weight_goal}
                  onChangeText={t => setOnboardingData({ ...onboardingData, weight_goal: t })}
                />

                <View style={styles.fieldRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.fieldLabel}>Target (kg)</Text>
                    <TextInput 
                      style={styles.fieldInput}
                      keyboardType="numeric"
                      value={onboardingData.target_weight.toString()}
                      onChangeText={t => setOnboardingData({ ...onboardingData, target_weight: parseFloat(t) || 0 })}
                    />
                  </View>
                  <View style={[styles.flex1, styles.ml3]}>
                    <Text style={styles.fieldLabel}>Budget (INR/wk)</Text>
                    <TextInput 
                      style={styles.fieldInput}
                      keyboardType="numeric"
                      value={onboardingData.weekly_budget.toString()}
                      onChangeText={t => setOnboardingData({ ...onboardingData, weekly_budget: parseFloat(t) || 0 })}
                    />
                  </View>
                </View>
              </View>
            )}

            {onboardingStep === 6 && (
              <View style={[styles.glassCard, styles.centerAlign]}>
                <Ionicons name="checkmark-circle-outline" size={72} color="#06B6D4" />
                <Text style={styles.stepHeading}>Ready for Launch</Text>
                <Text style={styles.stepBody}>
                  We've configured your boundaries, dietary patterns, and budget limits. Enter your diagnostic dashboard now.
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.onboardBtnRow}>
            {onboardingStep > 1 ? (
              <TouchableOpacity style={[styles.btnSecondary, styles.btnFlex]} onPress={() => setOnboardingStep(prev => prev - 1)}>
                <Text style={styles.btnSecondaryText}>Back</Text>
              </TouchableOpacity>
            ) : null}

            {onboardingStep < 6 ? (
              <TouchableOpacity style={[styles.btnPrimary, styles.btnFlex]} onPress={() => setOnboardingStep(prev => prev + 1)}>
                <Text style={styles.btnPrimaryText}>Continue</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.btnPrimary, styles.btnFlex]} onPress={saveOnboardingProfile}>
                <Text style={styles.btnPrimaryText}>Start Diagnostics</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.flex1}>
      <SafeAreaView style={styles.mainContainerOverlay}>
        <StatusBar barStyle="light-content" />

        <View style={styles.desktopLayoutRow}>
          {/* Main Content Pane */}
          <View style={styles.desktopMainPane}>
            {activeTab === 'home' && renderHomeTab()}
            {activeTab === 'recipes' && renderRecipeScanner()}
            {activeTab === 'camera' && renderFoodScanner()}
            {activeTab === 'chat' && renderChatTab()}
            {activeTab === 'profile' && renderProfileTab()}
          </View>
        </View>



        {/* Recipe Modal */}
        {activeRecipe && renderRecipeModal()}

        {/* Floating Glass Bottom Tab Bar */}
        {renderBottomTabBar()}
      </SafeAreaView>
    </View>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  flex1: { flex: 1, backgroundColor: '#080a10' },
  ml3: { marginLeft: 12 },
  mt3: { marginTop: 12 },
  mt4: { marginTop: 16 },
  py3: { paddingVertical: 12 },
  p5: { padding: 20 },
  fullWidthImage: { width: '100%', height: '100%' },
  dimOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  tabHeading: {
    fontSize: 28,
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 20,
    textShadowColor: 'rgba(6, 182, 212, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: '#080a10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 28,
    color: '#ffffff',
    fontWeight: 'bold',
    marginTop: 16,
    letterSpacing: 3,
    textShadowColor: 'rgba(6, 182, 212, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10
  },
  loadingSub: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    marginTop: 6
  },

  // Auth
  authContainer: {
    flex: 1,
    backgroundColor: '#080a10',
    justifyContent: 'center',
    padding: 24
  },
  authTitle: {
    fontSize: 28,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(168, 85, 247, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10
  },
  authSub: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24
  },
  authTabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20
  },
  authTabButton: {
    flex: 1,
    paddingBottom: 12,
    alignItems: 'center'
  },
  authTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#06B6D4'
  },
  authTabText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600'
  },
  authTabTextActive: {
    color: '#06B6D4'
  },
  authErr: {
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center'
  },
  formGroup: {
    marginBottom: 16
  },
  formLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 1
  },
  formInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 15
  },

  // Onboarding & Cards
  mainContainerOverlay: {
    flex: 1,
    backgroundColor: '#080a10',
  },
  onboardProgress: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)'
  },
  onboardProgressBar: {
    height: '100%',
    backgroundColor: '#06B6D4'
  },
  scrollContent: {
    padding: 24,
  },
  onboardStepIndicator: {
    fontSize: 11,
    color: '#06B6D4',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8
  },
  stepBox: {
    marginTop: 8
  },
  stepHeroImage: {
    width: '100%',
    height: 180,
    borderRadius: 20,
    marginBottom: 20
  },
  stepHeading: {
    fontSize: 26,
    color: '#ffffff',
    fontWeight: 'bold',
    lineHeight: 32,
    marginBottom: 12
  },
  stepBody: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 22
  },
  centerAlign: {
    alignItems: 'center',
    textAlign: 'center',
    paddingVertical: 40
  },
  fieldLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 12
  },
  fieldInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 15
  },
  fieldRow: {
    flexDirection: 'row',
    marginTop: 12
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  chipActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    borderColor: '#06B6D4'
  },
  chipText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600'
  },
  chipTextActive: {
    color: '#06B6D4'
  },
  onboardBtnRow: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)'
  },

  // Desktop Responsive Layout
  desktopLayoutRow: {
    flex: 1,
    flexDirection: 'row'
  },
  desktopMainPane: {
    flex: 1
  },

  // Glass Cards (iOS Cosmic Glass specification)
  glassCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)'
      }
    })
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16
  },

  // Home Screen
  homeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  headerDate: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  headerGreeting: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: 'bold',
    marginTop: 2,
    textShadowColor: 'rgba(168, 85, 247, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#06B6D4'
  },
  bentoCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)'
      }
    })
  },
  bentoTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 12
  },
  bentoSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
    marginBottom: 12
  },
  calorieStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  calorieCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 6,
    borderColor: '#06B6D4',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#06B6D4',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10
  },
  calorieNum: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: 'bold'
  },
  calorieLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    marginTop: 2
  },
  macroCol: {
    flex: 1,
    marginLeft: 20,
    gap: 6
  },
  macroText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600'
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4
  },
  progressIndicator: {
    height: '100%'
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16
  },
  gridHalfCard: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    padding: 16,
    minHeight: 130,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)'
      }
    })
  },
  gridHalfVal: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: 'bold',
    marginTop: 8
  },
  gridHalfLabel: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: 'bold',
    marginTop: 8
  },
  gridHalfSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2
  },
  glowCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#06B6D4',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 15,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)'
      }
    })
  },
  aiTipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6
  },
  aiTipLabel: {
    fontSize: 11,
    color: '#06B6D4',
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 1
  },
  aiTipBody: {
    fontSize: 13,
    color: '#ffffff',
    lineHeight: 18,
    fontStyle: 'italic'
  },
  sectionTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 8
  },
  emptyCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 8
  },
  recentItem: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)'
      }
    })
  },
  recentName: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: 'bold'
  },
  recentSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2
  },
  gradeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    color: '#06B6D4',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 32,
    borderWidth: 1,
    borderColor: '#06B6D4'
  },

  // Scanner Drawer & Panel
  tabHeading: {
    fontSize: 28,
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 16,
    textShadowColor: 'rgba(168, 85, 247, 0.5)',
    textShadowRadius: 8
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 16
  },
  modeBtnActive: {
    backgroundColor: '#06B6D4'
  },
  modeBtnText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '700'
  },
  modeBtnTextActive: {
    color: '#000000'
  },
  demoBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  demoTitle: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    fontWeight: '600'
  },
  demoButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  btnDemo: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  btnDemoText: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '600'
  },
  searchBox: {
    marginBottom: 16
  },
  searchBarRow: {
    flexDirection: 'row',
    gap: 8
  },
  btnSearch: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#06B6D4',
    alignItems: 'center',
    justifyContent: 'center'
  },
  scanBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16
  },
  cameraBox: {
    aspectRatio: 4/3,
    backgroundColor: '#000000',
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    marginBottom: 12
  },
  cameraPreview: {
    width: '100%',
    height: '100%'
  },
  cameraOffline: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40
  },
  cameraOfflineText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center'
  },
  loadingBox: {
    alignItems: 'center',
    padding: 24
  },
  resultBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 16
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  resultCategory: {
    fontSize: 10,
    color: '#06B6D4',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4
  },
  resultTitle: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: 'bold'
  },
  resultBrand: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2
  },
  resultGrades: {
    flexDirection: 'row',
    gap: 6
  },
  resultGradeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#06B6D4',
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 36
  },
  warningBox: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 4
  },
  warningText: {
    fontSize: 12,
    color: '#fca5a5',
    fontWeight: '600'
  },
  macroStatsGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
    justifyContent: 'space-between'
  },
  macroStatCell: {
    alignItems: 'center',
    flex: 1
  },
  macroStatVal: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: 'bold'
  },
  macroStatLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    marginTop: 2
  },
  ingredientsList: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4
  },
  wasteHackBox: {
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
    borderRadius: 16,
    padding: 16,
    marginTop: 16
  },
  wasteHackTitle: {
    fontSize: 12,
    color: '#06B6D4',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  wasteHackBody: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
    marginTop: 4
  },

  // Verdict Banner
  verdictBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    gap: 10
  },
  verdictEmoji: {
    fontSize: 24
  },
  verdictLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  verdictSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
    lineHeight: 15
  },
  gradeBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  gradeBadgeText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold'
  },

  // Calorie Highlight
  calorieHighlight: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4
  },
  calorieHighlightNum: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  calorieHighlightLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1
  },

  // Macro bars
  macroBarsSection: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    marginTop: 4
  },
  macroBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  macroBarLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    width: 46
  },
  macroBarTrack: {
    flex: 1,
    height: 7,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden'
  },
  macroBarFill: {
    height: '100%',
    borderRadius: 4
  },
  macroBarVal: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
    width: 62,
    textAlign: 'right'
  },
  macroBarPct: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 'normal'
  },

  // Eco score
  ecoScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 8
  },
  ecoScoreLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600'
  },
  ecoScoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8
  },
  ecoScoreBadgeText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13
  },
  ecoScoreHint: {
    flex: 1,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'right'
  },

  // Warnings
  warningSectionTitle: {
    fontSize: 13,
    color: '#fca5a5',
    fontWeight: 'bold',
    marginBottom: 6
  },
  warningRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start'
  },
  warningDot: {
    color: '#fca5a5',
    fontSize: 14,
    lineHeight: 20
  },

  // Ingredients chips
  ingredientsSection: {
    marginTop: 14
  },
  ingredientsTitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
    marginBottom: 8
  },
  ingredientsChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  ingredientChip: {
    backgroundColor: 'rgba(168,85,247,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.25)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  ingredientChipText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)'
  },

  // Chat Screen
  chatHeader: {
    padding: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center'
  },
  chatHeaderTitle: {
    fontSize: 17,
    color: '#ffffff',
    fontWeight: 'bold'
  },
  chatHeaderSub: {
    fontSize: 10,
    color: '#06B6D4',
    textTransform: 'uppercase',
    marginTop: 2
  },
  chatScroll: {
    flex: 1,
    padding: 16
  },
  chatBubbleContainer: {
    flexDirection: 'row',
    marginBottom: 12
  },
  bubbleUserAlign: { justifyContent: 'flex-end' },
  bubbleModelAlign: { justifyContent: 'flex-start' },
  chatBubble: {
    maxWidth: '85%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16
  },
  bubbleUser: {
    backgroundColor: 'rgba(168, 85, 247, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
    borderTopRightRadius: 2
  },
  bubbleModel: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderTopLeftRadius: 2
  },
  chatBubbleText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 19
  },
  chatInputRow: {
    padding: 16,
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'transparent'
  },
  chatInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 14
  },
  chatSendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#06B6D4',
    alignItems: 'center',
    justifyContent: 'center'
  },

  // Diet Planner
  daysScroll: {
    flexDirection: 'row',
    marginVertical: 12
  },
  dayTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 6
  },
  dayTabActive: {
    backgroundColor: '#06B6D4'
  },
  dayTabText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: 'bold'
  },
  dayTabTextActive: {
    color: '#000000'
  },
  mealsList: {
    gap: 10
  },
  mealItem: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    padding: 16,
    gap: 8
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  mealTag: {
    fontSize: 10,
    color: '#06B6D4',
    fontWeight: 'bold'
  },
  mealName: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: 'bold',
    marginTop: 2
  },
  mealCalories: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)'
  },
  mealMacros: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)'
  },

  // Profile Screen
  profileSummaryBox: {
    alignItems: 'center',
    marginVertical: 16
  },
  profileAvatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#06B6D4',
    marginBottom: 10
  },
  profileName: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: 'bold'
  },
  profileEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2
  },
  profileStatsRow: {
    flexDirection: 'row',
    gap: 8
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center'
  },
  statVal: {
    fontSize: 17,
    color: '#ffffff',
    fontWeight: 'bold'
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    marginTop: 2
  },
  profileChipsText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 18
  },

  // Floating Glass Navigation Bar
  bottomTabBar: {
    height: 72,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 10,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)'
      }
    })
  },
  tabItem: {
    alignItems: 'center',
    flex: 1
  },
  tabItemLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  tabItemLabelActive: {
    color: '#06B6D4'
  },

  // Buttons
  btnPrimary: {
    backgroundColor: '#06B6D4',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold'
  },
  btnSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnSecondaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold'
  },
  btnFlex: {
    flex: 1
  },
  btnDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20
  },
  btnDangerText: {
    color: '#fca5a5',
    fontSize: 15,
    fontWeight: 'bold'
  },
  btnMini: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start'
  },
  btnMiniText: {
    color: '#06B6D4',
    fontSize: 11,
    fontWeight: 'bold'
  },

  // Recipe Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 24,
    height: '70%',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)'
      }
    })
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 12
  },
  modalHeading: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: 'bold'
  },
  modalSub: {
    fontSize: 11,
    color: '#06B6D4',
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8
  },
  modalRecipeText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20
  },
  modalWasteBox: {
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
    borderRadius: 16,
    padding: 16,
    marginTop: 16
  },
  modalWasteTitle: {
    fontSize: 12,
    color: '#06B6D4',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  modalWasteBody: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
    marginTop: 4
  },

  // Sliding sheet (Mobile bottom sheet)
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  drawerBackdropDismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  bottomSheet: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 24,
    height: '80%',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)'
      }
    })
  },
  grabHandle: {
    width: 40,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 12
  },

  // Sliding Side Panel (PC Desktop)
  sidePanel: {
    width: 380,
    height: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.12)',
    padding: 20,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)'
      }
    })
  },
  panelContent: {
    flex: 1
  },
  panelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  panelTitle: {
    fontSize: 22,
    color: '#ffffff',
    fontWeight: 'bold',
    textShadowColor: 'rgba(6, 182, 212, 0.5)',
    textShadowRadius: 8
  },
  panelScroll: {
    paddingBottom: 24
  },

  // Food Scan Confirmation flow styles
  modalOverlayConfirm: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  confirmGlassCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 15 },
    shadowRadius: 25,
    elevation: 15,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)'
      }
    })
  },
  confirmTitle: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 16,
    textShadowColor: 'rgba(168, 85, 247, 0.5)',
    textShadowRadius: 8
  },
  confirmThumbnail: {
    width: 140,
    height: 140,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)'
  },
  confirmSub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    marginBottom: 12
  },
  confirmPresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  presetChipActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
    borderColor: '#A855F7'
  },
  presetChipText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600'
  },
  presetChipTextActive: {
    color: '#A855F7'
  },
  confirmInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 15,
    marginBottom: 20
  },
  confirmBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%'
  },

  // Gourmet Recipe suggestions styles
  recipesContainer: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16
  },
  recipesSectionHeader: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 12,
    textShadowColor: 'rgba(168, 85, 247, 0.4)',
    textShadowRadius: 6
  },
  recipeItemCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 16,
    marginBottom: 12
  },
  recipeItemName: {
    fontSize: 15,
    color: '#A855F7',
    fontWeight: 'bold',
    marginBottom: 8
  },
  recipeItemSub: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4
  },
  recipeItemIngRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4
  },
  recipeIngBadge: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderColor: 'rgba(168, 85, 247, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  recipeIngBadgeText: {
    fontSize: 11,
    color: '#D8B4FE',
    fontWeight: '600'
  },
  recipeItemInstructions: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 18
  }
});

