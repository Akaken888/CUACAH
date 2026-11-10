/* ====================================================================
   SkyCast — Weather Forecast Application
   script.js  |  Vanilla JavaScript (ES6+)
   API: Open-Meteo (https://open-meteo.com)
   ==================================================================== */

'use strict';

/* ---------- 1. API Endpoints ---------- */
const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_API  = 'https://api.open-meteo.com/v1/forecast';

/* ---------- 2. DOM References ---------- */
const $ = (id) => document.getElementById(id);

const searchInput    = $('searchInput');
const searchBtn      = $('searchBtn');
const locationBtn    = $('locationBtn');
const themeToggle    = $('themeToggle');
const searchResults  = $('searchResults');
const loadingEl      = $('loading');
const errorEl        = $('error');
const errorMessage   = $('errorMessage');
const contentEl      = $('content');

/* ---------- 3. State ---------- */
let lastRequestKey = null;   // Prevents duplicate API calls
let isFetching     = false;  // Lock during in-flight requests

/* ===================================================================
   4. WEATHER CODE MAPPING
   Converts WMO weather codes to human-readable descriptions & icons
   =================================================================== */

/**
 * Returns a readable weather description for a given WMO code.
 * @param {number} code — WMO weather code
 * @returns {string} description
 */
function getWeatherDescription(code) {
    const map = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        56: 'Light freezing drizzle',
        57: 'Dense freezing drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        66: 'Light freezing rain',
        67: 'Heavy freezing rain',
        71: 'Slight snow',
        73: 'Moderate snow',
        75: 'Heavy snow',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail'
    };
    return map[code] ?? 'Unknown';
}

/**
 * Returns a Lucide icon name for a given WMO code.
 * Day/night variants are chosen for clear / partly cloudy conditions.
 * @param {number} code — WMO weather code
 * @param {boolean} isDay — whether it is currently daytime
 * @returns {string} Lucide icon name
 */
function getWeatherIcon(code, isDay = true) {
    const iconMap = {
        0:  isDay ? 'sun'              : 'moon',
        1:  isDay ? 'sun'              : 'moon',
        2:  isDay ? 'cloud-sun'        : 'cloud-moon',
        3:  'cloud',
        45: 'cloud-fog',
        48: 'cloud-fog',
        51: 'cloud-drizzle',
        53: 'cloud-drizzle',
        55: 'cloud-drizzle',
        56: 'cloud-drizzle',
        57: 'cloud-drizzle',
        61: 'cloud-rain',
        63: 'cloud-rain',
        65: 'cloud-rain',
        66: 'cloud-rain-wind',
        67: 'cloud-rain-wind',
        71: 'cloud-snow',
        73: 'cloud-snow',
        75: 'cloud-snow',
        77: 'cloud-snow',
        80: 'cloud-rain',
        81: 'cloud-rain',
        82: 'cloud-rain-wind',
        85: 'cloud-snow',
        86: 'cloud-snow',
        95: 'cloud-lightning',
        96: 'cloud-lightning',
        99: 'cloud-lightning'
    };
    return iconMap[code] ?? 'cloud';
}

/* ===================================================================
   5. UV INDEX HELPERS
   =================================================================== */

/**
 * Returns a label and CSS badge class for a given UV index value.
 * @param {number} uv — UV index (0–11+)
 * @returns {{label: string, cls: string}}
 */
function getUVIndexInfo(uv) {
    if (uv <= 2) return { label: 'Low',       cls: 'uv-low' };
    if (uv <= 5) return { label: 'Moderate',  cls: 'uv-moderate' };
    if (uv <= 7) return { label: 'High',      cls: 'uv-high' };
    if (uv <= 10) return { label: 'Very High', cls: 'uv-very-high' };
    return { label: 'Extreme', cls: 'uv-extreme' };
}

/* ===================================================================
   6. TIME FORMATTING HELPERS
   All times from the API are in the city's local timezone (timezone=auto).
   We parse string parts directly to avoid user-timezone conversion issues.
   =================================================================== */

/**
 * Formats an hourly timestamp "2024-01-15T14:00" → "2 PM".
 * @param {string} timeStr
 * @returns {string}
 */
function formatHour(timeStr) {
    const hour = parseInt(timeStr.split('T')[1].split(':')[0], 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}\u00A0${period}`;
}

/**
 * Formats a full timestamp "2024-01-15T05:30" → "5:30 AM".
 * @param {string} timeStr
 * @returns {string}
 */
function formatTime(timeStr) {
    const parts = timeStr.split('T')[1].split(':');
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minute.toString().padStart(2, '0')}\u00A0${period}`;
}

/**
 * Returns the full weekday name for a date string "2024-01-15".
 * Uses UTC parsing so the weekday is correct regardless of user timezone.
 * @param {string} dateStr
 * @returns {string}
 */
function formatDayName(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d))
        .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

/**
 * Returns the short weekday name + date for a date string "2024-01-15".
 * @param {string} dateStr
 * @returns {string}
 */
function formatDayShort(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    return `${dayName} ${m}/${d}`;
}

/* ===================================================================
   7. DOM HELPER
   Safely creates an icon element that Lucide can render.
   =================================================================== */

/**
 * Creates an <i data-lucide="..."> element for Lucide icon rendering.
 * @param {string} iconName — Lucide icon name
 * @param {string} [className=''] — optional CSS class
 * @returns {HTMLElement}
 */
function createIcon(iconName, className = '') {
    const el = document.createElement('i');
    el.setAttribute('data-lucide', iconName);
    if (className) el.className = className;
    return el;
}

/**
 * Re-renders all Lucide icons in the document.
 * Call after any dynamic DOM insertion that includes data-lucide attributes.
 */
function refreshIcons() {
    if (window.lucide) lucide.createIcons();
}

/* ===================================================================
   8. LOADING & ERROR UI
   =================================================================== */

/** Shows the loading spinner and hides content. */
function showLoading() {
    loadingEl.hidden = false;
    errorEl.hidden = true;
    contentEl.style.visibility = 'hidden';
}

/** Hides the loading spinner and restores content. */
function hideLoading() {
    loadingEl.hidden = true;
    contentEl.style.visibility = 'visible';
}

/**
 * Displays an error message to the user.
 * @param {string} message — human-readable error text
 */
function showError(message) {
    loadingEl.hidden = true;
    contentEl.style.visibility = 'visible';
    errorEl.hidden = false;
    errorMessage.textContent = message;
}

/* ===================================================================
   9. API FUNCTIONS
   =================================================================== */

/**
 * Fetches city coordinates from the Open-Meteo Geocoding API.
 * @param {string} cityName — city name to search for
 * @returns {Promise<Array>} array of matching city results
 */
async function fetchCityCoordinates(cityName) {
    const url = `${GEOCODING_API}?name=${encodeURIComponent(cityName)}&count=5&language=en&format=json`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Geocoding request failed (HTTP ${res.status})`);

    const data = await res.json();
    // API returns { results: null } when nothing is found
    return data.results ?? [];
}

/**
 * Fetches weather data from the Open-Meteo Forecast API.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Object>} full weather data object
 */
async function fetchWeatherData(latitude, longitude) {
    const params = new URLSearchParams({
        latitude:  latitude.toString(),
        longitude: longitude.toString(),
        current: [
            'temperature_2m',
            'relative_humidity_2m',
            'apparent_temperature',
            'is_day',
            'precipitation',
            'weather_code',
            'wind_speed_10m'
        ].join(','),
        hourly: [
            'temperature_2m',
            'precipitation_probability',
            'weather_code'
        ].join(','),
        daily: [
            'weather_code',
            'temperature_2m_max',
            'temperature_2m_min',
            'sunrise',
            'sunset',
            'uv_index_max'
        ].join(','),
        timezone: 'auto',
        forecast_days: '7'
    });

    const url = `${FORECAST_API}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather request failed (HTTP ${res.status})`);

    const data = await res.json();
    if (!data.current || !data.hourly || !data.daily) {
        throw new Error('Received incomplete weather data from the API.');
    }
    return data;
}

/* ===================================================================
   10. DISPLAY FUNCTIONS
   =================================================================== */

/**
 * Displays current weather in the hero section.
 * @param {Object} current  — data.current object from the API
 * @param {Object} cityInfo  — { name, region, country }
 */
function displayCurrentWeather(current, cityInfo) {
    // City & region
    $('cityName').textContent = cityInfo.name;
    $('cityRegion').textContent =
        [cityInfo.region, cityInfo.country].filter(Boolean).join(', ') || cityInfo.country || '';

    // Temperature (most prominent element)
    $('currentTemp').textContent = `${Math.round(current.temperature_2m)}°`;

    // Weather icon
    const isDay = current.is_day === 1;
    const iconName = getWeatherIcon(current.weather_code, isDay);
    const iconContainer = $('currentIcon');
    iconContainer.innerHTML = '';
    iconContainer.appendChild(createIcon(iconName));

    // Condition description
    $('currentCondition').textContent = getWeatherDescription(current.weather_code);

    // Feels-like temperature
    $('feelsLike').textContent = `Feels like ${Math.round(current.apparent_temperature)}°`;

    // Day / night indicator
    const dayNightEl = $('dayNightIndicator');
    dayNightEl.innerHTML = '';
    dayNightEl.appendChild(createIcon(isDay ? 'sun' : 'moon'));
    const span = document.createElement('span');
    span.textContent = isDay ? 'Daytime' : 'Nighttime';
    dayNightEl.appendChild(span);

    // Stats: humidity, wind, precipitation
    $('humidity').textContent = `${current.relative_humidity_2m}%`;
    $('windSpeed').textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    $('precipitation').textContent = `${current.precipitation} mm`;

    refreshIcons();
}

/**
 * Displays the next 24 hours of hourly forecast in a horizontal scroll.
 * @param {Object} hourly  — data.hourly object from the API
 * @param {string} currentTime — data.current.time
 */
function displayHourlyForecast(hourly, currentTime) {
    const container = $('hourlyForecast');
    container.innerHTML = '';

    // Find the starting index: the hourly entry matching the current hour
    const currentHourPrefix = currentTime.substring(0, 13); // "2024-01-15T14"
    let startIdx = hourly.time.findIndex(t => t.substring(0, 13) === currentHourPrefix);

    // If exact match not found, use the first entry at or after current time
    if (startIdx === -1) {
        startIdx = hourly.time.findIndex(t => t >= currentTime);
        if (startIdx === -1) startIdx = 0;
    }

    // Display next 24 hours
    const endIdx = Math.min(startIdx + 24, hourly.time.length);

    for (let i = startIdx; i < endIdx; i++) {
        const card = document.createElement('div');
        card.className = 'hour-card';
        card.setAttribute('role', 'listitem');
        if (i === startIdx) card.classList.add('hour-card--now');

        // Time label
        const timeLabel = document.createElement('span');
        timeLabel.className = 'hour-card__time';
        timeLabel.textContent = i === startIdx ? 'Now' : formatHour(hourly.time[i]);

        // Weather icon
        const iconWrap = document.createElement('span');
        iconWrap.className = 'hour-card__icon';
        iconWrap.appendChild(createIcon(getWeatherIcon(hourly.weather_code[i], true)));

        // Temperature
        const temp = document.createElement('span');
        temp.className = 'hour-card__temp';
        temp.textContent = `${Math.round(hourly.temperature_2m[i])}°`;

        // Precipitation probability
        const precip = document.createElement('span');
        precip.className = 'hour-card__precip';
        const precipProb = hourly.precipitation_probability[i] ?? 0;
        precip.appendChild(createIcon('droplet'));
        const precipText = document.createElement('span');
        precipText.textContent = `${precipProb}%`;
        precip.appendChild(precipText);

        card.append(timeLabel, iconWrap, temp, precip);
        container.appendChild(card);
    }

    refreshIcons();
}

/**
 * Displays the 7-day forecast as a list.
 * @param {Object} daily — data.daily object from the API
 */
function displayDailyForecast(daily) {
    const container = $('dailyForecast');
    container.innerHTML = '';

    const count = daily.time.length;

    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.className = 'day-card';
        card.setAttribute('role', 'listitem');

        // Day name
        const nameWrap = document.createElement('div');
        nameWrap.className = 'day-card__name';
        const dayLabel = document.createElement('span');
        dayLabel.textContent = i === 0 ? 'Today' : formatDayName(daily.time[i]);
        const dateLabel = document.createElement('span');
        dateLabel.textContent = formatDayShort(daily.time[i]);
        nameWrap.append(dayLabel, dateLabel);

        // Icon
        const iconWrap = document.createElement('div');
        iconWrap.className = 'day-card__icon';
        iconWrap.appendChild(createIcon(getWeatherIcon(daily.weather_code[i], true)));

        // Description
        const desc = document.createElement('span');
        desc.className = 'day-card__desc';
        desc.textContent = getWeatherDescription(daily.weather_code[i]);

        // Max / min temps
        const temps = document.createElement('div');
        temps.className = 'day-card__temps';
        const maxTemp = document.createElement('span');
        maxTemp.className = 'day-card__max';
        maxTemp.textContent = `${Math.round(daily.temperature_2m_max[i])}°`;
        const minTemp = document.createElement('span');
        minTemp.className = 'day-card__min';
        minTemp.textContent = `${Math.round(daily.temperature_2m_min[i])}°`;
        temps.append(maxTemp, '/', minTemp);

        // UV index badge
        const uvWrap = document.createElement('div');
        uvWrap.className = 'day-card__uv';
        const uvVal = daily.uv_index_max[i] ?? 0;
        const uvInfo = getUVIndexInfo(uvVal);
        const uvBadge = document.createElement('span');
        uvBadge.className = `day-card__uv-badge ${uvInfo.cls}`;
        uvBadge.textContent = uvVal.toFixed(1);
        const uvLabel = document.createElement('span');
        uvLabel.textContent = uvInfo.label;
        uvWrap.append(uvBadge, uvLabel);

        card.append(nameWrap, iconWrap, desc, temps, uvWrap);
        container.appendChild(card);
    }

    refreshIcons();
}

/**
 * Displays additional weather info cards (sunrise, sunset, humidity, wind, UV).
 * @param {Object} data — full weather response object
 */
function displayAdditionalInformation(data) {
    const container = $('additionalInfo');
    container.innerHTML = '';

    const current = data.current;
    const daily = data.daily;
    const todayIdx = 0;

    // Helper to build an info card
    // variant: '' (pink default), 'warm' (amber), 'cool' (blue), 'purple' (lavender)
    function makeCard(iconName, label, value, sub, variant = '') {
        const card = document.createElement('div');
        card.className = 'info-card fade-in';

        const iconBox = document.createElement('div');
        iconBox.className = 'info-card__icon' + (variant ? ` info-card__icon--${variant}` : '');
        iconBox.appendChild(createIcon(iconName));

        const body = document.createElement('div');
        body.className = 'info-card__body';

        const labelEl = document.createElement('span');
        labelEl.className = 'info-card__label';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.className = 'info-card__value';
        valueEl.textContent = value;

        body.append(labelEl, valueEl);

        if (sub) {
            const subEl = document.createElement('span');
            subEl.className = 'info-card__sub';
            subEl.textContent = sub;
            body.appendChild(subEl);
        }

        card.append(iconBox, body);
        return card;
    }

    // Sunrise — warm amber
    container.appendChild(
        makeCard('sunrise', 'Sunrise', formatTime(daily.sunrise[todayIdx]), '', 'warm')
    );

    // Sunset — warm amber
    container.appendChild(
        makeCard('sunset', 'Sunset', formatTime(daily.sunset[todayIdx]), '', 'warm')
    );

    // Humidity — cool blue
    container.appendChild(
        makeCard('droplets', 'Humidity', `${current.relative_humidity_2m}%`, 'Relative humidity', 'cool')
    );

    // Wind speed — purple lavender
    container.appendChild(
        makeCard('wind', 'Wind Speed', `${Math.round(current.wind_speed_10m)} km/h`, 'Current conditions', 'purple')
    );

    // UV index — warm amber
    const uvVal = daily.uv_index_max[todayIdx] ?? 0;
    const uvInfo = getUVIndexInfo(uvVal);
    container.appendChild(
        makeCard('sun', 'UV Index', uvVal.toFixed(1), uvInfo.label, 'warm')
    );

    refreshIcons();
}

/* ===================================================================
   11. SEARCH & CITY SELECTION
   =================================================================== */

/**
 * Handles the city search flow: validates input, fetches coordinates,
 * and displays the search results dropdown for the user to pick from.
 */
async function searchCity() {
    const query = searchInput.value.trim();

    // Validate empty input
    if (!query) {
        showError('Please enter a city name to search.');
        return;
    }

    // Prevent duplicate requests for the same query
    if (isFetching) return;
    isFetching = true;
    showLoading();

    try {
        const results = await fetchCityCoordinates(query);

        if (results.length === 0) {
            showError(`No cities found for "${query}". Please try another name.`);
            return;
        }

        // If only one result, load it directly
        if (results.length === 1) {
            hideSearchResults();
            await loadWeatherForCity(results[0]);
        } else {
            // Multiple results: show dropdown for selection
            displaySearchResults(results);
            hideLoading();
            contentEl.style.visibility = 'visible';
        }
    } catch (err) {
        console.error('Search error:', err);
        showError(`Unable to search for cities: ${err.message}`);
    } finally {
        isFetching = false;
    }
}

/**
 * Renders the search results dropdown.
 * @param {Array} results — geocoding API results
 */
function displaySearchResults(results) {
    searchResults.innerHTML = '';

    results.forEach((city) => {
        const item = document.createElement('div');
        item.className = 'search-result';
        item.setAttribute('role', 'option');
        item.setAttribute('tabindex', '0');

        const name = document.createElement('span');
        name.className = 'search-result__name';
        name.textContent = `${city.name}, ${city.country}`;

        const detail = document.createElement('span');
        detail.className = 'search-result__detail';
        const parts = [];
        if (city.admin1) parts.push(city.admin1);
        if (city.admin2 && city.admin2 !== city.admin1) parts.push(city.admin2);
        parts.push(city.country);
        detail.textContent = parts.join(', ');

        item.append(name, detail);

        // Click or keyboard select
        item.addEventListener('click', () => selectCity(city));
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectCity(city);
            }
        });

        searchResults.appendChild(item);
    });

    searchResults.classList.add('active');
}

/** Hides the search results dropdown. */
function hideSearchResults() {
    searchResults.classList.remove('active');
    searchResults.innerHTML = '';
}

/**
 * Called when the user picks a city from the dropdown.
 * @param {Object} city — selected city object from geocoding API
 */
async function selectCity(city) {
    hideSearchResults();
    searchInput.value = '';

    const cityInfo = {
        name: city.name,
        region: city.admin1 || '',
        country: city.country || ''
    };

    await loadWeatherForCity(city, cityInfo);
}

/**
 * Loads and displays weather data for a given city object.
 * Includes duplicate-request prevention.
 * @param {Object} city — city object with latitude, longitude, name, etc.
 * @param {Object} [cityInfo] — optional display info override
 */
async function loadWeatherForCity(city, cityInfo) {
    const requestKey = `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`;

    // Prevent unnecessary duplicate API requests
    if (requestKey === lastRequestKey) {
        hideLoading();
        errorEl.hidden = true;
        return;
    }
    lastRequestKey = requestKey;

    isFetching = true;
    showLoading();

    try {
        const data = await fetchWeatherData(city.latitude, city.longitude);

        // Build city display info if not provided
        const info = cityInfo || {
            name: city.name,
            region: city.admin1 || '',
            country: city.country || ''
        };

        // Render all sections
        displayCurrentWeather(data.current, info);
        displayHourlyForecast(data.hourly, data.current.time);
        displayDailyForecast(data.daily);
        displayAdditionalInformation(data);

        // Update "last updated" timestamp in footer
        updateTimestamp();

        hideLoading();
        errorEl.hidden = true;
    } catch (err) {
        console.error('Weather fetch error:', err);
        showError(`Unable to load weather data: ${err.message}`);
    } finally {
        isFetching = false;
    }
}

/* ===================================================================
   12. GEOLOCATION
   =================================================================== */

/**
 * Uses the browser Geolocation API to detect the user's current location
 * and fetches weather data for those coordinates.
 */
function getCurrentLocation() {
    if (!navigator.geolocation) {
        showError('Geolocation is not supported by your browser.');
        return;
    }

    if (isFetching) return;
    isFetching = true;
    showLoading();

    navigator.geolocation.getCurrentPosition(
        // Success callback
        async (position) => {
            const { latitude, longitude } = position.coords;
            const requestKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;

            // Skip if same as last request
            if (requestKey === lastRequestKey) {
                hideLoading();
                isFetching = false;
                return;
            }
            lastRequestKey = requestKey;

            try {
                const data = await fetchWeatherData(latitude, longitude);

                // Display with generic location name
                const cityInfo = {
                    name: 'Your Location',
                    region: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
                    country: ''
                };

                displayCurrentWeather(data.current, cityInfo);
                displayHourlyForecast(data.hourly, data.current.time);
                displayDailyForecast(data.daily);
                displayAdditionalInformation(data);
                updateTimestamp();

                hideLoading();
                errorEl.hidden = true;
            } catch (err) {
                console.error('Geolocation weather error:', err);
                showError(`Unable to load weather for your location: ${err.message}`);
            } finally {
                isFetching = false;
            }
        },
        // Error callback — permission denied or unavailable
        (err) => {
            isFetching = false;
            let msg;
            switch (err.code) {
                case err.PERMISSION_DENIED:
                    msg = 'Location access denied. Showing weather for Jakarta instead.';
                    break;
                case err.POSITION_UNAVAILABLE:
                    msg = 'Location information is unavailable. Showing weather for Jakarta instead.';
                    break;
                case err.TIMEOUT:
                    msg = 'Location request timed out. Showing weather for Jakarta instead.';
                    break;
                default:
                    msg = 'Unable to determine your location. Showing weather for Jakarta instead.';
            }
            showError(msg);

            // Fall back to default city after a brief delay
            setTimeout(() => loadDefaultCity(), 2000);
        },
        // Options
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
}

/* ===================================================================
   13. DEFAULT CITY (Jakarta, Indonesia)
   =================================================================== */

/** Loads weather for Jakarta, Indonesia on first app load. */
async function loadDefaultCity() {
    const jakarta = {
        name: 'Jakarta',
        latitude: -6.2088,
        longitude: 106.8456,
        admin1: 'Jakarta',
        country: 'Indonesia'
    };
    await loadWeatherForCity(jakarta);
}

/* ===================================================================
   14. UTILITY
   =================================================================== */

/** Updates the "last updated" text in the footer. */
function updateTimestamp() {
    const now = new Date();
    const formatted = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
    $('lastUpdated').textContent = formatted;
}

/* ===================================================================
   14b. THEME TOGGLE (Light / Dark Mode)
   Persists the user's preference in localStorage.
   =================================================================== */

const THEME_KEY = 'skycast-theme';

/**
 * Toggles between light and dark themes.
 * Updates the body class, button icon, and saves to localStorage.
 */
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

/**
 * Updates the Lucide icon inside the theme toggle button.
 * Shows moon in light mode (switch to dark) and sun in dark mode (switch to light).
 * @param {boolean} isDark
 */
function updateThemeIcon(isDark) {
    const iconName = isDark ? 'sun' : 'moon';
    themeToggle.innerHTML = '';
    themeToggle.appendChild(createIcon(iconName));
    themeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    refreshIcons();
}

/**
 * Initializes the theme from localStorage or defaults to light mode.
 */
function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const isDark = saved === 'dark';
    document.body.classList.toggle('dark', isDark);
    updateThemeIcon(isDark);
}

/* ===================================================================
   15. EVENT LISTENERS
   =================================================================== */

// Search button click
searchBtn.addEventListener('click', searchCity);

// Enter key in search input
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        searchCity();
    }
});

// Geolocation button click
locationBtn.addEventListener('click', getCurrentLocation);

// Theme toggle button click
themeToggle.addEventListener('click', toggleTheme);

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search__wrapper')) {
        hideSearchResults();
    }
});

// Escape key closes search results
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideSearchResults();
        searchInput.blur();
    }
});

/* ===================================================================
   16. INITIALIZATION
   =================================================================== */

/** Runs on page load: initializes theme, renders Lucide icons, loads default city. */
function init() {
    initTheme();
    refreshIcons();
    loadDefaultCity();
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
