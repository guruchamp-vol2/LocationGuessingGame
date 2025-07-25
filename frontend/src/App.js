import React, { useState, useEffect } from "react";
import { getAllLocations, getLocationsByRegion } from "./locations";
import "./App.css";
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const modes = [
  { key: "easy", label: "Easy", description: "Street view + hints", difficulty: 1 },
  { key: "medium", label: "Medium", description: "Street view + some hints", difficulty: 2 },
  { key: "hard", label: "Hard", description: "Single image only", difficulty: 3 },
  { key: "impossible", label: "Impossible", description: "Blurred image + no hints", difficulty: 4 }
];

const regions = [
  { key: "world", label: "World", description: "Global locations" },
  { key: "eu", label: "Europe", description: "European cities" },
  { key: "usa", label: "USA", description: "American cities" }
];

const aiOpponents = [
  { id: "ai_easy", name: "AI Rookie", skill: 0.3, description: "Just learning geography" },
  { id: "ai_medium", name: "AI Explorer", skill: 0.6, description: "Well-traveled AI" },
  { id: "ai_hard", name: "AI Master", skill: 0.85, description: "Geography expert" },
  { id: "ai_impossible", name: "AI Legend", skill: 0.95, description: "Perfect knowledge" }
];

const gameTypes = [
  { key: "solo", label: "Solo vs AI", description: "Play against computer opponents" },
  { key: "multiplayer", label: "Multiplayer", description: "Play with friends (coming soon)" }
];

// --- Lobby Component ---
function Lobby({ onStartGame }) {
  const MAX_PLAYERS = 8;
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [teamMode, setTeamMode] = useState(false);
  const [teams, setTeams] = useState([[], []]);

  const handleJoin = () => {
    if (players.length < MAX_PLAYERS && name && !players.includes(name)) {
      setPlayers([...players, name]);
      setName("");
    }
  };

  const assignTeams = () => {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const mid = Math.ceil(shuffled.length / 2);
    setTeams([shuffled.slice(0, mid), shuffled.slice(mid)]);
  };

  const startGame = () => {
    onStartGame({
      players,
      teams: teamMode ? teams : null,
      teamMode,
    });
  };

  return (
    <div className="menu-container">
      <h2>Lobby</h2>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Enter your name"
      />
      <button onClick={handleJoin} disabled={!name || players.includes(name)}>
        Join
      </button>
      <div>
        <label>
          <input
            type="checkbox"
            checked={teamMode}
            onChange={e => setTeamMode(e.target.checked)}
          />
          Team Mode
        </label>
      </div>
      <div>
        <h3>Players ({players.length}/{MAX_PLAYERS}):</h3>
        <ul>
          {players.map(p => <li key={p}>{p}</li>)}
        </ul>
      </div>
      {teamMode && (
        <div>
          <button onClick={assignTeams} disabled={players.length < 2}>
            Assign Teams
          </button>
          <div>
            <h4>Team 1</h4>
            <ul>{teams[0].map(p => <li key={p}>{p}</li>)}</ul>
            <h4>Team 2</h4>
            <ul>{teams[1].map(p => <li key={p}>{p}</li>)}</ul>
          </div>
        </div>
      )}
      <button
        onClick={startGame}
        disabled={players.length < 2 || (teamMode && (teams[0].length === 0 || teams[1].length === 0))}
      >
        Start Game
      </button>
    </div>
  );
}

// --- TeamChat Component ---
function TeamChat({ teamId, playerName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  // Fallback: local chat only (replace with Ably logic if available)
  const sendMessage = () => {
    if (input.trim()) {
      setMessages(msgs => [...msgs, { player: playerName, text: input }]);
      setInput("");
    }
  };
  return (
    <div className="chat">
      <ul>
        {messages.map((msg, i) => (
          <li key={i}><b>{msg.player}:</b> {msg.text}</li>
        ))}
      </ul>
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => e.key === "Enter" && sendMessage()}
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}

// Map click handler component
function GuessMap({ onGuess, guess }) {
  useMapEvents({
    click(e) {
      console.log("Map clicked at:", e.latlng);
      onGuess({ lat: e.latlng.lat, lng: e.latlng.lng });
    }
  });
  return guess.lat !== 0 ? <Marker position={[guess.lat, guess.lng]} /> : null;
}

// --- Main App ---
function App() {
  const [selectedRegion, setSelectedRegion] = useState("world");
  const [selectedMode, setSelectedMode] = useState(null);
  const [selectedGameType, setSelectedGameType] = useState("solo");
  const [selectedAI, setSelectedAI] = useState("ai_medium");
  const [gameState, setGameState] = useState("menu"); // menu, playing, results, multiplayer
  const [currentLocation, setCurrentLocation] = useState(null);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [userGuess, setUserGuess] = useState({ lat: 0, lng: 0 });
  const [aiGuess, setAiGuess] = useState({ lat: 0, lng: 0 });
  const [score, setScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [totalGuesses, setTotalGuesses] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [distance, setDistance] = useState(0);
  const [aiDistance, setAiDistance] = useState(0);
  const [hint, setHint] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [roundTime, setRoundTime] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [stage, setStage] = useState("lobby");
  const [gameProps, setGameProps] = useState(null);

  // Calculate distance between two points in km
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Calculate score based on distance and difficulty
  const calculateScore = (distance, difficulty) => {
    let baseScore;
    if (distance < 1) baseScore = 100;
    else if (distance < 5) baseScore = 90;
    else if (distance < 10) baseScore = 80;
    else if (distance < 25) baseScore = 70;
    else if (distance < 50) baseScore = 60;
    else if (distance < 100) baseScore = 50;
    else if (distance < 250) baseScore = 40;
    else if (distance < 500) baseScore = 30;
    else if (distance < 1000) baseScore = 20;
    else baseScore = 10;

    // Apply difficulty multiplier
    const difficultyMultiplier = 1 + (difficulty - 1) * 0.5;
    return Math.round(baseScore * difficultyMultiplier);
  };

  // Generate AI guess based on skill level
  const generateAIGuess = (actualLocation, skill) => {
    const baseAccuracy = skill;
    const maxError = (1 - skill) * 2000; // Max error in km
    
    const errorDistance = Math.random() * maxError;
    const errorAngle = Math.random() * 2 * Math.PI;
    
    const errorLat = (errorDistance / 111) * Math.cos(errorAngle);
    const errorLng = (errorDistance / (111 * Math.cos(actualLocation.lat * Math.PI / 180))) * Math.sin(errorAngle);
    
    return {
      lat: actualLocation.lat + errorLat,
      lng: actualLocation.lng + errorLng
    };
  };

  // Generate hint based on location and difficulty
  const generateHint = (location, difficulty) => {
    const hints = {
      easy: [
        `This is ${location.name}, ${location.country}`,
        `Located in ${location.country}`,
        `Famous city in ${location.country}`,
        `Capital of ${location.country}`
      ],
      medium: [
        `This city is in ${location.country}`,
        `Located in the ${location.region} region`,
        `A major city in ${location.country}`,
        `Known for its culture and history`
      ],
      hard: [
        `This is a ${location.region} city`,
        `Located in ${location.country}`,
        `A well-known urban area`,
        `Famous for tourism`
      ],
      impossible: [
        `This is a city somewhere in the world`,
        `An urban area with people`,
        `A place you might visit`,
        `Somewhere on Earth`
      ]
    };
    
    const difficultyHints = hints[modes.find(m => m.key === selectedMode)?.key] || hints.hard;
    return difficultyHints[Math.floor(Math.random() * difficultyHints.length)];
  };

  // Start a new game
  const startGame = () => {
    const availableLocations = getLocationsByRegion(selectedRegion);
    const randomLocation = availableLocations[Math.floor(Math.random() * availableLocations.length)];
    setCurrentLocation(randomLocation);
    setCurrentMediaIndex(Math.floor(Math.random() * randomLocation.images.length));
    setGameState("playing");
    setUserGuess({ lat: 0, lng: 0 });
    setAiGuess({ lat: 0, lng: 0 });
    setShowResults(false);
    setShowHint(false);
    setRoundTime(0);
    setIsTimerRunning(true);
    
    // Generate hint
    const newHint = generateHint(randomLocation, selectedMode);
    setHint(newHint);
    
    // Generate AI guess after a delay
    setTimeout(() => {
      const ai = aiOpponents.find(a => a.id === selectedAI);
      const aiGuessResult = generateAIGuess(randomLocation, ai.skill);
      setAiGuess(aiGuessResult);
    }, 2000 + Math.random() * 3000); // AI takes 2-5 seconds
  };

  // Handle map click for guessing
  const handleMapClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Convert to lat/lng (simplified world map)
    const lng = (x / rect.width) * 360 - 180;
    const lat = 90 - (y / rect.height) * 180;
    
    setUserGuess({ lat, lng });
  };

  // Submit guess
  const submitGuess = () => {
    console.log("Submit guess called");
    
    if (!currentLocation) {
      console.log("No current location!");
      alert("No location loaded. Please try again.");
      return;
    }
    
    if (userGuess.lat === 0) {
      console.log("No user guess made!");
      alert("Please click on the map to make a guess first!");
      return;
    }
    
    console.log("Stopping timer and calculating results...");
    setIsTimerRunning(false);
    
    const dist = calculateDistance(
      currentLocation.lat, currentLocation.lng,
      userGuess.lat, userGuess.lng
    );
    
    const aiDist = calculateDistance(
      currentLocation.lat, currentLocation.lng,
      aiGuess.lat, aiGuess.lng
    );
    
    const difficulty = modes.find(m => m.key === selectedMode)?.difficulty || 1;
    const roundScore = calculateScore(dist, difficulty);
    const aiRoundScore = calculateScore(aiDist, difficulty);
    
    console.log("Distance:", dist, "AI Distance:", aiDist);
    console.log("Round score:", roundScore, "AI Round score:", aiRoundScore);
    
    setDistance(dist);
    setAiDistance(aiDist);
    setScore(prevScore => prevScore + roundScore);
    setAiScore(prevAiScore => prevAiScore + aiRoundScore);
    setTotalGuesses(prev => prev + 1);
    setShowResults(true);
    setGameState("results");
  };

  // Next round
  const nextRound = () => {
    console.log("Starting next round...");
    setShowResults(false);
    setGameState("playing");
    setUserGuess({ lat: 0, lng: 0 });
    setRoundTime(0);
    setIsTimerRunning(true);
    startGame();
  };

  // Back to menu
  const backToMenu = () => {
    console.log("Going back to menu...");
    setGameState("menu");
    setScore(0);
    setAiScore(0);
    setTotalGuesses(0);
    setCurrentLocation(null);
    setIsTimerRunning(false);
    setShowResults(false);
    setUserGuess({ lat: 0, lng: 0 });
    setRoundTime(0);
  };

  // Get current media based on mode
  const getCurrentMedia = () => {
    if (!currentLocation) return null;
    
    // Always use images for all modes now - more reliable
    const imageIndex = currentMediaIndex % currentLocation.images.length;
    return currentLocation.images[imageIndex];
  };

  // Timer effect
  useEffect(() => {
    let interval;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setRoundTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // --- Multiplayer Flow ---
  const handleStartGame = (props) => {
    setGameProps(props);
    setStage("game");
    // Optionally, set up round, teams, etc.
  };

  // Render menu screen
  if (gameState === "menu") {
    return (
      <div className="App">
        <div className="menu-container">
          <h1>🌍 Location Guessing Game</h1>
          <p>Test your knowledge against AI opponents!</p>
          
          <div className="selection-section">
            <h2>Select Game Type</h2>
            <div className="game-type-buttons">
              {gameTypes.map(type => (
                <button
                  key={type.key}
                  className={`game-type-btn ${selectedGameType === type.key ? 'selected' : ''}`}
                  onClick={() => setSelectedGameType(type.key)}
                >
                  <h3>{type.label}</h3>
                  <p>{type.description}</p>
                </button>
              ))}
            </div>
          </div>

          {selectedGameType === "solo" && (
            <div className="selection-section">
              <h2>Select AI Opponent</h2>
              <div className="ai-buttons">
                {aiOpponents.map(ai => (
                  <button
                    key={ai.id}
                    className={`ai-btn ${selectedAI === ai.id ? 'selected' : ''}`}
                    onClick={() => setSelectedAI(ai.id)}
                  >
                    <h3>{ai.name}</h3>
                    <p>{ai.description}</p>
                    <span className="skill-level">Skill: {Math.round(ai.skill * 100)}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="selection-section">
            <h2>Select Region</h2>
            <div className="region-buttons">
              {regions.map(region => (
                <button
                  key={region.key}
                  className={`region-btn ${selectedRegion === region.key ? 'selected' : ''}`}
                  onClick={() => setSelectedRegion(region.key)}
                >
                  <h3>{region.label}</h3>
                  <p>{region.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="selection-section">
            <h2>Select Difficulty</h2>
            <div className="mode-buttons">
              {modes.map(mode => (
                <button
                  key={mode.key}
                  className={`mode-btn ${selectedMode === mode.key ? 'selected' : ''}`}
                  onClick={() => setSelectedMode(mode.key)}
                >
                  <h3>{mode.label}</h3>
                  <p>{mode.description}</p>
                  <span className="difficulty-level">Level {mode.difficulty}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            className="start-btn"
            disabled={!selectedMode || (selectedGameType === "solo" && !selectedAI)}
            onClick={startGame}
          >
            🚀 Start Game
          </button>
        </div>
      </div>
    );
  }

  // Render game screen
  if (gameState === "playing") {
    const media = getCurrentMedia();
    const currentAI = aiOpponents.find(a => a.id === selectedAI);
    
    return (
      <div className="App">
        <div className="game-container">
          <div className="game-header">
            <h2>Round {totalGuesses + 1}</h2>
            <div className="score-display">
              <span>You: {score}</span>
              <span>{currentAI?.name}: {aiScore}</span>
              <span>Time: {Math.floor(roundTime / 60)}:{(roundTime % 60).toString().padStart(2, '0')}</span>
            </div>
          </div>

          <div className="opponent-info">
            <h3>Playing against: {currentAI?.name}</h3>
            <p>{currentAI?.description}</p>
          </div>

          <div className="media-container">
            {currentLocation && media && (
              <div className="location-view-container">
                {/* Show location image for all modes */}
                <div style={{ 
                  padding: '10px', 
                  background: '#f0f0f0', 
                  fontSize: '12px', 
                  color: '#666',
                  textAlign: 'center',
                  marginBottom: '10px'
                }}>
                  <p>
                    {selectedMode === "easy" && "Easy Mode: Clear view of the location"}
                    {selectedMode === "medium" && "Medium Mode: Location view"}
                    {selectedMode === "hard" && "Hard Mode: Challenging view"}
                    {selectedMode === "impossible" && "Impossible Mode: Heavily blurred view"}
                  </p>
                </div>
                
                <img
                  src={media}
                  alt="Location to guess"
                  className={`game-media ${selectedMode === "impossible" ? "blurred" : ""}`}
                  style={{ 
                    width: '100%', 
                    maxWidth: '600px', 
                    height: 'auto', 
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    minHeight: '300px',
                    objectFit: 'cover'
                  }}
                  onLoad={(e) => {
                    console.log("Image loaded successfully:", media);
                  }}
                  onError={(e) => {
                    console.log("Image failed to load:", media);
                    e.target.style.display = 'none';
                    // Show fallback with location name hint
                    const fallback = document.createElement('div');
                    fallback.innerHTML = `
                      <div style="padding: 40px; text-align: center; color: #666; background: #f8f9fa; border-radius: 8px; min-height: 300px; display: flex; flex-direction: column; justify-content: center;">
                        <h3>📍 Location: ${currentLocation.name}</h3>
                        <p><strong>Country:</strong> ${currentLocation.country}</p>
                        <p><strong>Region:</strong> ${currentLocation.region}</p>
                        <p style="margin-top: 20px; font-size: 14px; color: #888;">Image loading issue - but you can still guess based on the location name!</p>
                      </div>
                    `;
                    e.target.parentNode.appendChild(fallback);
                  }}
                />
                
                {/* Additional hints based on mode */}
                <div style={{ 
                  padding: '10px', 
                  background: '#f8f9fa', 
                  fontSize: '12px', 
                  color: '#666',
                  textAlign: 'center',
                  marginTop: '10px',
                  borderRadius: '4px'
                }}>
                  {selectedMode === "easy" && (
                    <p><strong>Hint:</strong> Look for famous landmarks, architecture, and street signs!</p>
                  )}
                  {selectedMode === "medium" && (
                    <p><strong>Hint:</strong> Focus on the city layout, buildings, and distinctive features!</p>
                  )}
                  {selectedMode === "hard" && (
                    <p><strong>Hint:</strong> Pay attention to subtle details and architectural styles!</p>
                  )}
                  {selectedMode === "impossible" && (
                    <p><strong>Hint:</strong> Even with blur, you can see shapes and general layout!</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Show loading state if no media */}
            {currentLocation && !media && (
              <div style={{ 
                padding: '40px', 
                textAlign: 'center', 
                color: '#666', 
                background: '#f8f9fa', 
                borderRadius: '8px',
                minHeight: '300px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}>
                <h3>Loading location...</h3>
                <p>Please wait while we load the location image.</p>
              </div>
            )}
          </div>

          {showHint && (
            <div className="hint-container">
              <h3>💡 Hint</h3>
              <p>{hint}</p>
            </div>
          )}

          <div className="map-container">
            <h3>Click on the map to make your guess:</h3>
            <MapContainer
              center={[20, 0]}
              zoom={2}
              style={{ width: '100%', height: '300px', border: '2px solid #333', borderRadius: '8px' }}
              scrollWheelZoom={true}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
              <GuessMap onGuess={setUserGuess} guess={userGuess} />
            </MapContainer>
          </div>

          <div className="game-controls">
            <button
              className="hint-btn"
              onClick={() => setShowHint(!showHint)}
            >
              {showHint ? "Hide Hint" : "Show Hint"}
            </button>
            {userGuess.lat !== 0 && (
              <div style={{ 
                background: '#e8f5e8', 
                padding: '10px', 
                borderRadius: '5px', 
                margin: '10px 0',
                border: '1px solid #4caf50'
              }}>
                ✅ Guess made at: {userGuess.lat.toFixed(4)}, {userGuess.lng.toFixed(4)}
              </div>
            )}
            <button
              className="submit-btn"
              disabled={userGuess.lat === 0}
              onClick={submitGuess}
              style={{
                backgroundColor: userGuess.lat === 0 ? '#ccc' : '#4caf50',
                color: 'white',
                padding: '10px 20px',
                border: 'none',
                borderRadius: '5px',
                cursor: userGuess.lat === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              {userGuess.lat === 0 ? "Click map first to guess" : "Submit Guess"}
            </button>
            <button className="back-btn" onClick={backToMenu}>
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render results screen
  if (gameState === "results" && showResults && currentLocation) {
    const difficulty = modes.find(m => m.key === selectedMode)?.difficulty || 1;
    const roundScore = calculateScore(distance, difficulty);
    const aiRoundScore = calculateScore(aiDistance, difficulty);
    const currentAI = aiOpponents.find(a => a.id === selectedAI);
    
    const accuracy = distance < 1 ? "Perfect!" : 
                   distance < 5 ? "Excellent!" :
                   distance < 25 ? "Good!" :
                   distance < 100 ? "Fair" : "Try again!";
    
    const aiAccuracy = aiDistance < 1 ? "Perfect!" : 
                      aiDistance < 5 ? "Excellent!" :
                      aiDistance < 25 ? "Good!" :
                      aiDistance < 100 ? "Fair" : "Try again!";
    
    const winner = roundScore > aiRoundScore ? "You won!" : 
                  roundScore < aiRoundScore ? `${currentAI?.name} won!` : "It's a tie!";
    
    return (
      <div className="App">
        <div className="results-container">
          <h2>Round Results</h2>
          
          <div className="winner-announcement">
            <h3>{winner}</h3>
          </div>
          
          <div className="result-info">
            <h3>📍 {currentLocation.name}, {currentLocation.country}</h3>
            <p>Your guess was <strong>{distance.toFixed(1)} km</strong> away</p>
            <p>Your accuracy: <strong>{accuracy}</strong></p>
            <p>Your score: <strong>{roundScore}/100</strong></p>
          </div>

          <div className="ai-result-info">
            <h3>🤖 {currentAI?.name}</h3>
            <p>AI guess was <strong>{aiDistance.toFixed(1)} km</strong> away</p>
            <p>AI accuracy: <strong>{aiAccuracy}</strong></p>
            <p>AI score: <strong>{aiRoundScore}/100</strong></p>
          </div>

          <div className="comparison-map">
            <h3>Your Guess vs AI vs Actual Location</h3>
            <div 
              className="world-map"
              style={{
                width: '100%',
                height: '300px',
                background: 'linear-gradient(45deg, #87CEEB, #98FB98)',
                border: '2px solid #333',
                borderRadius: '8px',
                position: 'relative'
              }}
            >
              {/* Actual location marker */}
              <div
                className="actual-marker"
                style={{
                  position: 'absolute',
                  left: `${((currentLocation.lng + 180) / 360) * 100}%`,
                  top: `${((90 - currentLocation.lat) / 180) * 100}%`,
                  width: '12px',
                  height: '12px',
                  backgroundColor: 'green',
                  borderRadius: '50%',
                  border: '2px solid white',
                  transform: 'translate(-50%, -50%)'
                }}
              />
              {/* User guess marker */}
              <div
                className="guess-marker"
                style={{
                  position: 'absolute',
                  left: `${((userGuess.lng + 180) / 360) * 100}%`,
                  top: `${((90 - userGuess.lat) / 180) * 100}%`,
                  width: '12px',
                  height: '12px',
                  backgroundColor: 'red',
                  borderRadius: '50%',
                  border: '2px solid white',
                  transform: 'translate(-50%, -50%)'
                }}
              />
              {/* AI guess marker */}
              <div
                className="ai-marker"
                style={{
                  position: 'absolute',
                  left: `${((aiGuess.lng + 180) / 360) * 100}%`,
                  top: `${((90 - aiGuess.lat) / 180) * 100}%`,
                  width: '12px',
                  height: '12px',
                  backgroundColor: 'blue',
                  borderRadius: '50%',
                  border: '2px solid white',
                  transform: 'translate(-50%, -50%)'
                }}
              />
            </div>
            <p>
              <span style={{color: 'green'}}>●</span> Actual | 
              <span style={{color: 'red'}}>●</span> Your Guess | 
              <span style={{color: 'blue'}}>●</span> AI Guess
            </p>
          </div>

          <div className="score-summary">
            <h3>Current Scores</h3>
            <div className="score-comparison">
              <div className="player-score">
                <span>You: {score}</span>
              </div>
              <div className="ai-score">
                <span>{currentAI?.name}: {aiScore}</span>
              </div>
            </div>
          </div>

          <div className="result-controls">
            <button className="next-btn" onClick={nextRound}>
              Next Round
            </button>
            <button className="back-btn" onClick={backToMenu}>
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render lobby screen
  if (stage === "lobby") {
    return (
      <Lobby onStartGame={handleStartGame} />
    );
  }

  // Render game screen
  if (stage === "game") {
    const media = getCurrentMedia();
    return (
      <div className="App">
        <div className="game-container">
          <div className="game-header">
            <h2>Game</h2>
            <div className="score-display">
              <span>You: {score}</span>
              <span>Time: {Math.floor(roundTime / 60)}:{(roundTime % 60).toString().padStart(2, '0')}</span>
            </div>
          </div>

          <div className="opponent-info">
            <h3>Playing against: {gameProps?.players.map(p => p).join(", ")}</h3>
            {gameProps?.teamMode && (
              <>
                <h4>Your Team: {gameProps.players.indexOf(gameProps.players.find(p => p === "Your Name")) + 1}</h4>
                <p>Team 1: {gameProps.teams[0].map(p => p).join(", ")}</p>
                <p>Team 2: {gameProps.teams[1].map(p => p).join(", ")}</p>
              </>
            )}
          </div>

          <div className="media-container">
            {selectedMode === "easy" && media && (
              <video
                controls
                autoPlay
                muted
                className={`game-media ${selectedMode === "impossible" ? "blurred" : ""}`}
                src={media}
                onError={(e) => {
                  console.log("Video failed to load:", media);
                  e.target.style.display = 'none';
                  // Show fallback message
                  const fallback = document.createElement('div');
                  fallback.innerHTML = '<p>Video not available. Please use image mode instead.</p>';
                  fallback.style.padding = '20px';
                  fallback.style.textAlign = 'center';
                  fallback.style.color = '#666';
                  e.target.parentNode.appendChild(fallback);
                }}
              >
                Your browser does not support the video tag.
              </video>
            )}
            {(selectedMode === "medium" || selectedMode === "hard" || selectedMode === "impossible") && media && (
              <img
                src={media}
                alt="Location to guess"
                className={`game-media ${selectedMode === "impossible" ? "blurred" : ""}`}
                onError={(e) => {
                  console.log("Image failed to load:", media);
                  e.target.style.display = 'none';
                  // Show fallback message
                  const fallback = document.createElement('div');
                  fallback.innerHTML = '<p>Image not available. Please try again.</p>';
                  fallback.style.padding = '20px';
                  fallback.style.textAlign = 'center';
                  fallback.style.color = '#666';
                  e.target.parentNode.appendChild(fallback);
                }}
              />
            )}
          </div>

          {showHint && (
            <div className="hint-container">
              <h3>💡 Hint</h3>
              <p>{hint}</p>
            </div>
          )}

          <div className="map-container">
            <h3>Click on the map to make your guess:</h3>
            <MapContainer
              center={[20, 0]}
              zoom={2}
              style={{ width: '100%', height: '300px', border: '2px solid #333', borderRadius: '8px' }}
              scrollWheelZoom={true}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />
              <GuessMap onGuess={setUserGuess} guess={userGuess} />
            </MapContainer>
          </div>

          <div className="game-controls">
            <button
              className="hint-btn"
              onClick={() => setShowHint(!showHint)}
            >
              {showHint ? "Hide Hint" : "Show Hint"}
            </button>
            <button
              className="submit-btn"
              disabled={userGuess.lat === 0}
              onClick={submitGuess}
            >
              Submit Guess
            </button>
            <button className="back-btn" onClick={backToMenu}>
              Back to Menu
            </button>
          </div>

          {gameProps?.teamMode && (
            <TeamChat teamId="team1" playerName={gameProps.players.find(p => p === "Your Name")} />
          )}
        </div>
      </div>
    );
  }

  // Fallback render for unknown state
  return <div className="App"><h2>Loading or unknown state</h2></div>;
}

export default App;
