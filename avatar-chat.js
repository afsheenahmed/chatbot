document.addEventListener('DOMContentLoaded', function() {
    const assistant = {
        // Configuration
        config: {
            webhookUrl: 'https://auto4554.app.n8n.cloud/webhook-test/80b12a58-ba27-4b2e-a090-bc40649ee025',
            audioFormat: 'audio/wav',
            thinkingMessages: [
                "Let me think about that...",
                "Processing your request...",
                "Working on it..."
            ]
        },
        
        // State
        state: {
            isOpen: false,
            isListening: false,
            isProcessing: false,
            mediaRecorder: null,
            audioChunks: [],
            audioContext: null,
            sessionId: Date.now().toString(),
            responseMode: 'voice' // 'voice', 'text', or 'avatar'
        },
        
        // Initialize
        init() {
            this.setupElements();
            this.setupEventListeners();
            this.generateSessionId();
        },
        
        // DOM Elements
        setupElements() {
            this.elements = {
                // Main elements
                assistant: document.getElementById('ai-assistant'),
                toggle: document.getElementById('assistant-toggle'),
                panel: document.querySelector('.assistant-panel'),
                closeBtn: document.getElementById('close-panel'),
                
                // Chat display
                chatDisplay: document.getElementById('chat-display'),
                
                // Input elements
                textInput: document.getElementById('text-input'),
                sendTextBtn: document.getElementById('send-text'),
                voiceControl: document.getElementById('voice-control'),
                
                // Avatar elements
                avatar: document.getElementById('ai-avatar'),
                speechBubble: document.getElementById('speech-bubble'),
                
                // Mode selector
                modeOptions: document.querySelectorAll('input[name="response-mode"]')
            };
        },
        
        // Event Listeners
        setupEventListeners() {
            // Toggle panel
            this.elements.toggle.addEventListener('click', () => this.togglePanel());
            this.elements.closeBtn.addEventListener('click', () => this.togglePanel());
            
            // Text input
            this.elements.sendTextBtn.addEventListener('click', () => this.handleTextInput());
            this.elements.textInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleTextInput();
            });
            
            // Voice control
            this.elements.voiceControl.addEventListener('click', () => this.toggleVoiceRecording());
            
            // Mode selection
            this.elements.modeOptions.forEach(option => {
                option.addEventListener('change', (e) => {
                    this.state.responseMode = e.target.value;
                });
            });
        },
        
        // Generate session ID
        generateSessionId() {
            this.state.sessionId = 'session-' + Math.random().toString(36).substr(2, 9);
        },
        
        // Toggle panel visibility
        togglePanel() {
            this.state.isOpen = !this.state.isOpen;
            this.elements.panel.classList.toggle('active', this.state.isOpen);
            
            if (this.state.isOpen) {
                this.elements.textInput.focus();
            }
        },
        
        // Handle text input
        handleTextInput() {
            const message = this.elements.textInput.value.trim();
            if (!message || this.state.isProcessing) return;
            
            this.addMessage(message, 'user');
            this.elements.textInput.value = '';
            this.showThinkingIndicator();
            
            // Process text input
            this.processUserInput(message, 'text');
        },
        
        // Toggle voice recording
        async toggleVoiceRecording() {
            if (this.state.isProcessing) return;
            
            if (this.state.isListening) {
                this.stopVoiceRecording();
            } else {
                await this.startVoiceRecording();
            }
        },
        
        // Start voice recording
        async startVoiceRecording() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.state.mediaRecorder = new MediaRecorder(stream);
                this.state.audioChunks = [];
                
                this.state.mediaRecorder.ondataavailable = (e) => {
                    this.state.audioChunks.push(e.data);
                };
                
                this.state.mediaRecorder.onstop = () => {
                    this.processUserInput(null, 'voice');
                };
                
                this.state.mediaRecorder.start();
                this.state.isListening = true;
                this.updateVoiceControlState('listening');
                this.updateAvatarState('listening');
                this.addMessage("(Listening...)", 'user');
                
                // Auto-stop after 30 seconds
                this.state.recordingTimeout = setTimeout(() => {
                    this.stopVoiceRecording();
                }, 30000);
                
            } catch (error) {
                console.error("Recording error:", error);
                this.addMessage("Couldn't access microphone", 'ai');
                this.updateVoiceControlState('error');
                setTimeout(() => this.resetVoiceControl(), 2000);
            }
        },
        
        // Stop voice recording
        stopVoiceRecording() {
            if (this.state.mediaRecorder && this.state.isListening) {
                clearTimeout(this.state.recordingTimeout);
                this.state.mediaRecorder.stop();
                this.state.mediaRecorder.stream.getTracks().forEach(track => track.stop());
                this.state.isListening = false;
                this.updateVoiceControlState('thinking');
                this.updateAvatarState('thinking');
                this.showThinkingIndicator();
            }
        },
        
        // Process user input (text or voice)
        async processUserInput(input, inputType) {
            this.state.isProcessing = true;
            
            let formData = new FormData();
            let headers = {
                'Session-ID': this.state.sessionId,
                'Input-Type': inputType,
                'Response-Mode': this.state.responseMode
            };
            
            if (inputType === 'voice') {
                const audioBlob = new Blob(this.state.audioChunks, { type: this.config.audioFormat });
                formData.append('audio', audioBlob, 'recording.wav');
                headers['Accept'] = this.state.responseMode === 'voice' ? 'audio/mp3' : 'text/plain';
            } else {
                formData.append('text', input);
                headers['Accept'] = 'text/plain';
            }
            
            try {
                const response = await fetch(this.config.webhookUrl, {
                    method: 'POST',
                    body: formData,
                    headers: headers
                });
                
                if (!response.ok) {
                    throw new Error(`Server error: ${response.status}`);
                }
                
                this.handleResponse(response);
                
            } catch (error) {
                console.error("API error:", error);
                this.addMessage("Sorry, something went wrong", 'ai');
                this.updateVoiceControlState('error');
                this.updateAvatarState('idle');
            } finally {
                this.state.isProcessing = false;
                this.resetVoiceControl();
                this.removeThinkingIndicator();
            }
        },
        
        // Handle API response
        async handleResponse(response) {
            const contentType = response.headers.get('content-type');
            
            // Voice response
            if (contentType && contentType.includes('audio') && this.state.responseMode === 'voice') {
                const audioBlob = await response.blob();
                this.playAudioResponse(audioBlob);
            } 
            // Avatar response
            else if (this.state.responseMode === 'avatar') {
                const textResponse = await response.text();
                this.showAvatarResponse(textResponse);
            } 
            // Text response
            else {
                const textResponse = await response.text();
                this.addMessage(textResponse, 'ai');
            }
        },
        
        // Play audio response
        playAudioResponse(audioBlob) {
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            this.updateAvatarState('speaking');
            
            audio.onplay = () => {
                this.addMessage("(Speaking...)", 'ai');
            };
            
            audio.onended = () => {
                this.updateAvatarState('idle');
            };
            
            audio.onerror = () => {
                this.addMessage("Couldn't play audio", 'ai');
                this.updateAvatarState('idle');
            };
            
            audio.play().catch(e => {
                console.error("Playback failed:", e);
                this.addMessage("Audio playback blocked", 'ai');
            });
        },
        
        // Show avatar response
        showAvatarResponse(text) {
            this.elements.speechBubble.textContent = '';
            this.elements.speechBubble.style.display = 'block';
            this.updateAvatarState('speaking');
            
            // Typewriter effect
            let i = 0;
            const speed = 30;
            const typeWriter = () => {
                if (i < text.length) {
                    this.elements.speechBubble.textContent += text.charAt(i);
                    i++;
                    setTimeout(typeWriter, speed);
                } else {
                    setTimeout(() => {
                        this.elements.speechBubble.style.display = 'none';
                        this.updateAvatarState('idle');
                    }, 3000);
                }
            };
            
            typeWriter();
        },
        
        // Update voice control state
        updateVoiceControlState(state) {
            this.elements.voiceControl.className = '';
            this.elements.voiceControl.classList.add(state);
            
            const statusText = this.elements.voiceControl.querySelector('.status-text');
            if (statusText) {
                statusText.textContent = 
                    state === 'listening' ? 'Listening...' :
                    state === 'thinking' ? 'Processing...' :
                    state === 'error' ? 'Error occurred' : 'Tap to speak';
            }
        },
        
        // Update avatar state
        updateAvatarState(state) {
            this.elements.avatar.className = 'avatar';
            if (state !== 'idle') {
                this.elements.avatar.classList.add(state);
            }
        },
        
        // Reset voice control
        resetVoiceControl() {
            if (!this.state.isListening && !this.state.isProcessing) {
                this.updateVoiceControlState('idle');
            }
        },
        
        // Show thinking indicator
        showThinkingIndicator() {
            const thinkingDiv = document.createElement('div');
            thinkingDiv.className = 'message ai-message typing-indicator';
            thinkingDiv.innerHTML = `
                <span></span>
                <span></span>
                <span></span>
            `;
            this.elements.chatDisplay.appendChild(thinkingDiv);
            this.elements.chatDisplay.scrollTop = this.elements.chatDisplay.scrollHeight;
        },
        
        // Remove thinking indicator
        removeThinkingIndicator() {
            const indicators = document.querySelectorAll('.typing-indicator');
            indicators.forEach(indicator => indicator.remove());
        },
        
        // Add message to chat
        addMessage(text, sender) {
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message', `${sender}-message`);
            messageDiv.textContent = text;
            this.elements.chatDisplay.appendChild(messageDiv);
            this.elements.chatDisplay.scrollTop = this.elements.chatDisplay.scrollHeight;
        }
    };
    
    // Initialize the assistant
    assistant.init();
});