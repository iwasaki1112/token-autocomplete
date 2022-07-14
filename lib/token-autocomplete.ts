interface Token {
    value: string,
    text: string,
    type: string | null
}

interface Suggestion {
    id: string | null,
    value: string,
    fieldLabel: string,
    type: string | null,
    completionLabel: string | null,
    completionDescription: string | null
}

interface Options {
    name: string,
    selector: string,
    noMatchesText: string | null,
    noMatchesCustomEntriesDescription: string | null,
    placeholderText: string | null,
    initialTokens: Array<Token> | null,
    initialSuggestions: Array<Suggestion> | null,
    tokenRenderer: TokenRenderer,
    selectMode: SelectModes,
    suggestionsUri: string,
    suggestionsUriBuilder: SuggestionUriBuilder,
    suggestionRenderer: SuggestionRenderer,
    minCharactersForSuggestion: number,
    allowCustomEntries: boolean,
    readonly: boolean,
    optional: boolean,
    enableTabulator: boolean,
    showSuggestionsOnFocus: boolean,
    requestDelay: number
}

enum SelectModes {
    SINGLE, MULTI, SEARCH
}

interface SelectMode {
    addToken(suggestionValue: string | null, suggestionText: string | null, suggestionType: string | null, silent: boolean): void;

    handleInputAsValue(input: string): void;

    initEventListeners(): void;

    clear(silent: boolean): void;

    clearCurrentInput(): void;
}

interface SingleSelect extends SelectMode {
}

interface MultiSelect extends SelectMode {
    removeToken(token: HTMLSpanElement): void;

    removeLastToken(): void;

    removeTokenWithText(textContent: any): void;
}

interface Autocomplete {
    suggestions: any;

    initEventListeners(): void;

    requestSuggestions(value: string): void;

    highlightSuggestionAtPosition(arg0: number): void;

    addSuggestion(suggestion: Suggestion, showSuggestions: boolean): void;

    clearSuggestions(): void;

    showSuggestions(): void;

    hideSuggestions(): void;

    loadSuggestions(): void;

    areSuggestionsDisplayed(): boolean;

    areSuggestionsActive(): boolean;

    highlightSuggestion(arg0: Element): void;
}

interface TokenRenderer {
    (token: Token): HTMLElement;
}

interface SuggestionRenderer {
    (suggestion: Suggestion): HTMLElement;
}

interface SuggestionUriBuilder {
    (query: string): string;
}

class TokenAutocomplete {

    KEY_BACKSPACE = 'Backspace';
    KEY_ENTER = 'Enter';
    KEY_TAB = 'Tab';
    KEY_UP = 'ArrowUp';
    KEY_DOWN = 'ArrowDown';
    KEY_LEFT = 'ArrowLeft';
    KEY_RIGHT = 'ArrowRight';
    KEY_ESC = 'Escape';

    options: Options;
    container: any;
    hiddenSelect: HTMLSelectElement;
    textInput: HTMLSpanElement;

    select: SelectMode;
    autocomplete: Autocomplete;

    defaults: Options = {
        name: '',
        selector: '',
        noMatchesText: null,
        noMatchesCustomEntriesDescription: null,
        placeholderText: 'enter some text',
        initialTokens: null,
        initialSuggestions: null,
        tokenRenderer: TokenAutocomplete.MultiSelect.defaultRenderer,
        suggestionsUri: '',
        selectMode: SelectModes.MULTI,
        suggestionsUriBuilder: function (query) {
            return this.suggestionsUri + '?query=' + query
        },
        suggestionRenderer: TokenAutocomplete.Autocomplete.defaultRenderer,
        minCharactersForSuggestion: 1,
        allowCustomEntries: true,
        readonly: false,
        optional: false,
        enableTabulator: true,
        showSuggestionsOnFocus: true,
        requestDelay: 200
    };
    log: any;

    constructor(options: Options) {
        this.options = {...this.defaults, ...options};

        let passedContainer = document.querySelector(this.options.selector);
        if (!passedContainer) {
            throw new Error('passed selector does not point to a DOM element.');
        }

        this.container = passedContainer;
        this.container.classList.add('token-autocomplete-container');

        if (!Array.isArray(this.options.initialTokens) && !Array.isArray(this.options.initialSuggestions)) {
            this.parseTokensAndSuggestions();
        }

        this.hiddenSelect = document.createElement('select');
        this.hiddenSelect.id = this.container.id + '-select';
        this.hiddenSelect.name = this.options.name;
        this.hiddenSelect.setAttribute('multiple', 'true');
        this.hiddenSelect.setAttribute('autocomplete', 'off');
        this.hiddenSelect.style.display = 'none';

        if (this.options.readonly && this.options.tokenRenderer === TokenAutocomplete.MultiSelect.defaultRenderer) {
            this.options.tokenRenderer = TokenAutocomplete.MultiSelect.defaultReadonlyRenderer;
        }

        this.textInput = document.createElement('span');
        this.textInput.id = this.container.id + '-input';
        this.textInput.classList.add('token-autocomplete-input');
        if (!this.options.readonly) {
            if (this.options.placeholderText != null) {
                this.textInput.dataset.placeholder = this.options.placeholderText;
            }

            this.textInput.contentEditable = 'true';
            this.textInput.addEventListener("paste", function (event) {
                event.preventDefault();
                const text = event.clipboardData?.getData("text/plain");
                document.execCommand("insertHTML", false, text);
            });
        } else {
            this.container.classList.add('token-autocomplete-readonly');
        }
        this.container.appendChild(this.textInput);


        this.container.appendChild(this.hiddenSelect);
        this.addHiddenEmptyOption();

        if (this.options.selectMode == SelectModes.MULTI) {
            this.select = new TokenAutocomplete.MultiSelect(this);
        } else if (this.options.selectMode == SelectModes.SEARCH) {
            this.select = new TokenAutocomplete.SearchMultiSelect(this);
        } else if (this.options.selectMode == SelectModes.SINGLE) {
            this.hiddenSelect.removeAttribute('multiple');
            this.select = new TokenAutocomplete.SingleSelect(this);
        }
        this.autocomplete = new TokenAutocomplete.Autocomplete(this);

        this.select.initEventListeners();
        this.autocomplete.initEventListeners();

        this.debug(false);

        if (Array.isArray(this.options.initialTokens)) {
            this.val(this.options.initialTokens);
        }

        this.container.tokenAutocomplete = this as TokenAutocomplete;

        if (this.options.selectMode == SelectModes.SINGLE && !this.options.optional && this.val().length == 0) {
            this.autocomplete.loadSuggestions();
        }
    }

    /**
     * Searches the element given as a container for option elements and creates active tokens (when the option is marked selected)
     * and suggestions (all options found) from these. During this all found options are removed from the DOM.
     */
    parseTokensAndSuggestions() {
        let initialTokens: Array<Token> = [];
        let initialSuggestions: Array<Suggestion> = [];

        let options: NodeListOf<HTMLOptionElement> = this.container.querySelectorAll('option');

        let me = this;
        options.forEach(function (option) {
            if (option.text != null) {
                if (option.hasAttribute('selected')) {
                    initialTokens.push({value: option.value, text: option.text, type: null});
                }
                initialSuggestions.push({
                    id: null,
                    value: option.value,
                    fieldLabel: option.text,
                    type: null,
                    completionDescription: option.dataset.description || null,
                    completionLabel: null
                });
            }
            me.container.removeChild(option);
        });

        if (initialSuggestions.length > 0) {
            this.options.initialSuggestions = initialSuggestions;
            if (!this.options.optional && initialTokens.length == 0) {
                let firstSuggestion = initialSuggestions[0];
                initialTokens.push({
                    value: firstSuggestion.value, text: firstSuggestion.fieldLabel, type: firstSuggestion.type
                });
            }
        }

        if (initialTokens.length > 0) {
            this.options.initialTokens = initialTokens;
        }
    }

    /**
     * Clears the currently present tokens and creates new ones from the given input value, returns new tokens afterwards.
     *
     * The current tokens are only overwritten (cleared and added) when a value parameter is given.
     * In addition to the possibility of setting the value of the input this method also returns the values of all present tokens.
     *
     * @param {(Array<Token>|Token)} value - either the name of a single token or a list of tokens to create
     * @param {boolean} silent - whether appropriate events should be triggered when changing tokens or not
     *
     * @returns an array of the values of all current (after update) tokens of the input field
     */
    val(value: Array<Token> | Token | null = null, silent: boolean = false): Array<string> {
        if (typeof value !== 'undefined' && value !== null) {
            this.select.clear(silent);
            this.addToken(value, silent);
        }

        let tokens: Array<string> = [];
        this.hiddenSelect.querySelectorAll('option').forEach(option => {
            if (option.dataset.value != null && option.dataset.value !== "") {
                tokens.push(option.dataset.value);
            }
        });
        return tokens;
    }


    /**
     * Adds the given tokens to the field.
     *
     * The current tokens are only added when a value parameter is given.
     *
     * @param {(Array<Token>|Token)} value - either the name of a single token or a list of tokens to create
     * @param {boolean} silent - whether appropriate events should be triggered when changing tokens or not
     */
    addToken(value: Array<Token> | Token, silent: boolean = false) {
        if (Array.isArray(value)) {
            let me = this;
            value.forEach(function (token) {
                if (typeof token === 'object') {
                    me.select.addToken(token.value, token.text, token.type, silent);
                }
            });
        } else {
            this.select.addToken(value.value, value.text, value.type, silent);
        }
    }

    /**
     * Returns the current text the user has input which is not converted into a token.
     */
    getCurrentInput() {
        return this.textInput.textContent || '';
    }

    setCurrentInput(input: string, silent: boolean) {
        this.textInput.textContent = input;

        if (silent) {
            return;
        }

        this.container.dispatchEvent(new CustomEvent('query-changed', {
            detail: {
                query: input
            }
        }));
    }

    addHiddenOption(tokenValue: string, tokenText: string, tokenType: string | null, isLiveEntry: boolean = false) {
        let _emptyToken = this.hiddenSelect.querySelector('.empty-token');
        if (_emptyToken) {
            this.hiddenSelect.removeChild(_emptyToken);
        }
        let _existingLiveEntry = this.hiddenSelect.querySelector('.live-entry');
        if (_existingLiveEntry) {
            this.hiddenSelect.removeChild(_existingLiveEntry);
        }
        let _existingOption = this.findOptionWithValue(tokenValue);
        if (_existingOption) {
            this.hiddenSelect.removeChild(_existingOption);
        }
        const option = document.createElement('option');
        option.text = tokenText;
        option.value = tokenValue;
        option.selected = true;
        option.dataset.text = tokenText;
        option.dataset.value = tokenValue;
        if (tokenType != null) {
            option.dataset.type = tokenType;
        }
        if (isLiveEntry) {
            option.classList.add('live-entry');
        }
        this.hiddenSelect.add(option);
    }

    findOptionWithValue(optionValue: string) {
        for (let i = 0; i < this.hiddenSelect.options.length; i++) {
            let option = this.hiddenSelect.options[i];
            if (option.value === optionValue) {
                return option;
            }
        }
        return null;
    }

    addHiddenEmptyOption() {
        let _emptyToken = this.hiddenSelect.querySelector('.empty-token');
        if (_emptyToken) {
            _emptyToken.setAttribute('selected', 'true');
        } else {
            const _newOption = document.createElement('option');
            _newOption.text = '';
            _newOption.value = '';
            _newOption.selected = true;
            _newOption.classList.add('empty-token');
            this.hiddenSelect.add(_newOption);
        }
    }

    setPlaceholderText(placeholderText: string | undefined) {
        this.textInput.dataset.placeholder = placeholderText;
    }

    debug(state: boolean) {
        if (state) {
            this.log = console.log.bind(window.console);
        } else {
            this.log = function () {
                // Intentionally left empty to only log when debugging is enabled.
            }
        }
    }

    static MultiSelect = class implements MultiSelect {

        parent: TokenAutocomplete;
        container: any;
        options: Options;
        renderer: TokenRenderer;

        constructor(parent: TokenAutocomplete) {
            this.parent = parent;
            this.container = parent.container;
            this.options = parent.options;
            this.renderer = parent.options.tokenRenderer;
        }

        clearCurrentInput(): void {
            this.parent.textInput.textContent = '';
        }

        initEventListeners(): void {
            const me = this;
            const parent = this.parent;
            if (parent.options.readonly) {
                return;
            }

            parent.textInput.addEventListener('compositionend', function (event) {
                // handles hitting ENTER on GBoard, which uses composition events instead of individual key triggers
                let inputString = event.data;
                if (inputString.charAt(inputString.length - 1) === "\n") {
                    event.preventDefault();
                    me.handleInput(parent.autocomplete.suggestions.querySelector('.token-autocomplete-suggestion-highlighted'));
                }
            })

            parent.textInput.addEventListener('keydown', function (event) {
                if (event.key == parent.KEY_ENTER || (event.key == parent.KEY_TAB && parent.options.enableTabulator)) {
                    event.preventDefault();

                    let highlightedSuggestion = parent.autocomplete.suggestions.querySelector('.token-autocomplete-suggestion-highlighted');

                    if (parent.options.enableTabulator && highlightedSuggestion == null && event.key == parent.KEY_TAB && parent.autocomplete.areSuggestionsDisplayed()) {
                        highlightedSuggestion = parent.autocomplete.suggestions.firstChild;
                    }

                    me.handleInput(highlightedSuggestion);
                } else if (parent.getCurrentInput() === '' && event.key == parent.KEY_BACKSPACE) {
                    event.preventDefault();
                    me.removeLastToken();
                }
                if ((event.key == parent.KEY_DOWN || event.key == parent.KEY_UP) && parent.autocomplete.suggestions.childNodes.length > 0) {
                    event.preventDefault();
                }
            });
        }

        handleInput(highlightedSuggestion: any): void {
            if (highlightedSuggestion !== null) {
                this.clearCurrentInput();
                if (highlightedSuggestion.classList.contains('token-autocomplete-suggestion-active')) {
                    this.removeTokenWithText(highlightedSuggestion.dataset.tokenText);
                } else {
                    this.addToken(highlightedSuggestion.dataset.value, highlightedSuggestion.dataset.tokenText, highlightedSuggestion.dataset.type, false);
                }
            } else {
                this.handleInputAsValue(this.parent.getCurrentInput());
            }
            this.parent.autocomplete.clearSuggestions();
            this.parent.autocomplete.hideSuggestions();
        }

        /**
         * Adds the current user input as a net token and resets the input area so new text can be entered.
         *
         * @param {string} input - the actual input the user entered
         */
        handleInputAsValue(input: string): void {
            if (input != '' && this.parent.options.allowCustomEntries) {
                this.clearCurrentInput();
                this.addToken(input, input, null);
                return;
            }
            if (this.parent.autocomplete.suggestions.childNodes.length === 1 && this.parent.autocomplete.suggestions.childNodes[0].dataset.value != '_no_match_') {
                this.parent.autocomplete.suggestions.firstChild.click();
            } else {
                this.clearCurrentInput();
            }
        }

        /**
         * Adds a token with the specified name to the list of currently present tokens displayed to the user and the hidden select.
         *
         * @param {string} tokenValue - the actual value of the token to create
         * @param {string} tokenText - the name of the token to create
         * @param {string} tokenType - the type of the token to create
         * @param {boolean} silent - whether an appropriate event should be triggered
         */
        addToken(tokenValue: string | null, tokenText: string | null, tokenType: string | null, silent: boolean = false) {
            if (tokenValue === null || tokenText === null || tokenValue === '_no_match_') {
                return;
            }

            this.parent.addHiddenOption(tokenValue, tokenText, tokenType);

            let addedToken = {
                value: tokenValue,
                text: tokenText,
                type: tokenType
            };

            let element = this.renderer(addedToken);

            let me = this;
            element.querySelector('.token-autocomplete-token-delete')?.addEventListener('click', function () {
                me.removeToken(element);
            });

            this.container.insertBefore(element, this.parent.textInput);

            if (!silent) {
                this.container.dispatchEvent(new CustomEvent('tokens-changed', {
                    detail: {
                        tokens: this.parent.val(),
                        added: addedToken
                    }
                }));
            }

            this.parent.log('added token', addedToken);
        }

        /**
         * Completely clears the currently present tokens from the field.
         */
        clear(silent: boolean = false) {
            let tokens: NodeListOf<HTMLElement> = this.container.querySelectorAll('.token-autocomplete-token');

            let me = this;
            tokens.forEach(function (token) {
                me.removeToken(token, silent);
            });
        }

        /**
         * Removes the last token in the list of currently present token. This is the last added token next to the input field.
         */
        removeLastToken() {
            let tokens = this.container.querySelectorAll('.token-autocomplete-token');
            let token = tokens[tokens.length - 1];
            if (token) {
                this.removeToken(token);
            }
        }

        /**
         * Removes the specified token from the list of currently present tokens.
         *
         * @param {Element} token - the token to remove
         * @param {boolean} silent - whether an appropriate event should be triggered
         */
        removeToken(token: HTMLElement, silent: boolean = false) {
            this.container.removeChild(token);

            let tokenText = token.dataset.text;
            let hiddenOption = this.parent.hiddenSelect.querySelector('option[data-text="' + TokenAutocomplete.escapeQuotes(tokenText) + '"]');
            hiddenOption?.parentElement?.removeChild(hiddenOption);

            let addedToken = {
                value: token.dataset.value,
                text: tokenText,
                type: token.dataset.type || null
            };

            if (!silent) {
                this.container.dispatchEvent(new CustomEvent('tokens-changed', {
                    detail: {
                        tokens: this.parent.val(),
                        removed: addedToken
                    }
                }));
            }

            if (this.parent.val().length === 0) {
                this.parent.addHiddenEmptyOption();
            }

            this.parent.log('removed token', token.textContent);
        }

        removeTokenWithText(tokenText: string | null) {
            if (tokenText === null) {
                return;
            }
            let token = this.container.querySelector('.token-autocomplete-token[data-text="' + TokenAutocomplete.escapeQuotes(tokenText) + '"]');
            if (token !== null) {
                this.removeToken(token);
            }
        }

        static defaultRenderer: TokenRenderer = function (token: Token): HTMLElement {
            const chip = document.createElement('span');
            chip.classList.add('token-autocomplete-token');
            chip.dataset.text = token.text;
            chip.dataset.value = token.value;
            if (token.type != null) {
                chip.dataset.type = token.type;
            }
            chip.textContent = token.text;

            let deleteToken = document.createElement('span');
            deleteToken.classList.add('token-autocomplete-token-delete');
            deleteToken.textContent = '\u00D7';
            chip.appendChild(deleteToken);

            return chip;
        }

        static defaultReadonlyRenderer: TokenRenderer = function (token: Token): HTMLElement {
            const chip = document.createElement('span');
            chip.classList.add('token-autocomplete-token');
            chip.dataset.text = token.text;
            chip.dataset.value = token.value;
            if (token.type != null) {
                chip.dataset.type = token.type;
            }
            chip.textContent = token.text;

            return chip;
        }
    }

    static SingleSelect = class implements SingleSelect {

        parent: TokenAutocomplete;
        container: any;
        options: Options;
        renderer: TokenRenderer;
        previousValue: any;
        previousText: any;
        previousType: any;

        constructor(parent: TokenAutocomplete) {
            this.parent = parent;
            this.container = parent.container;
            this.options = parent.options;

            this.container.classList.add('token-autocomplete-singleselect');
            this.parent.textInput.tabIndex = 0;
            if (this.options.optional) {
                let deleteToken = document.createElement('span');
                deleteToken.classList.add('token-singleselect-token-delete');
                deleteToken.textContent = '\u00D7';
                this.container.appendChild(deleteToken);
            }
        }

        /**
         * Clears the current user input so new text can be entered.
         *
         * @param {boolean} silent - whether an appropriate event should be triggered
         * @param {boolean} keepPreviousValue - if true, the previous value will be stored and shown as a placeholder
         */
        clear(silent: boolean, keepPreviousValue = true): void {
            if (this.options.readonly) {
                return;
            }
            let me = this;
            let tokenText = me.parent.textInput.textContent;
            let hiddenOption = me.parent.hiddenSelect.querySelector('option[data-text="' + TokenAutocomplete.escapeQuotes(tokenText) + '"]') as HTMLElement;
            if (me.options.optional) {
                this.container.classList.remove('optional-singleselect-with-value');
            }
            if (keepPreviousValue) {
                me.previousValue = hiddenOption?.dataset.value;
                me.previousText = hiddenOption?.dataset.text;
                me.previousType = hiddenOption?.dataset.type;
                if (hiddenOption == null && me.options.allowCustomEntries) {
                    me.previousValue = tokenText;
                    me.previousText = tokenText;
                }
                if (me.previousText && me.previousText !== '') {
                    me.parent.textInput.dataset.placeholder = me.previousText;
                }
            } else {
                // We should reset these fields, so they are not used to restore the previously selected value
                // when the focusout event is handled after the click event on the suggestion.
                delete me.previousValue;
                delete me.previousText;
                delete me.previousType;
                if (me.parent.options.placeholderText != null) {
                    me.parent.textInput.dataset.placeholder = me.parent.options.placeholderText;
                }
            }
            hiddenOption?.parentElement?.removeChild(hiddenOption);
            me.parent.addHiddenEmptyOption();
            me.parent.textInput.textContent = '';
            me.parent.textInput.contentEditable = 'true';
        }

        /**
         * Adds the current user input as a net token and resets the input area so new text can be entered.
         *
         * @param {string} input - the actual input the user entered
         */
        handleInputAsValue(input: string): void {
            if (input != '' && this.parent.options.allowCustomEntries) {
                this.clearCurrentInput();
                this.addToken(input, input, null, false);
                this.parent.autocomplete.clearSuggestions();
                this.parent.autocomplete.hideSuggestions();
                return;
            }
            if (this.parent.autocomplete.suggestions.childNodes.length === 1 && this.parent.autocomplete.suggestions.childNodes[0].dataset.value != '_no_match_') {
                this.parent.autocomplete.suggestions.firstChild.click();
                return;
            }
            this.clear(true, false);
        }

        clearCurrentInput(): void {
            this.clear(true);
        }

        addToken(tokenValue: string | null, tokenText: string | null, tokenType: string | null, silent: boolean): void {
            if (tokenValue === null || tokenText === null || tokenValue === '_no_match_') {
                return;
            }
            this.clear(true, false);
            this.parent.textInput.textContent = tokenText;
            this.parent.textInput.contentEditable = 'false';
            if (this.options.optional && tokenText !== '') {
                this.container.classList.add('optional-singleselect-with-value');
            }

            this.parent.addHiddenOption(tokenValue, tokenText, tokenType);
        }

        initEventListeners(): void {
            const me = this;
            const parent = this.parent;
            if (parent.options.readonly) {
                return;
            }

            parent.textInput.addEventListener('compositionend', function (event) {
                // handles hitting ENTER on GBoard, which uses composition events instead of individual key triggers
                let inputString = event.data;
                if (inputString.charAt(inputString.length - 1) === "\n") {
                    event.preventDefault();
                    me.handleInput(parent.autocomplete.suggestions.querySelector('.token-autocomplete-suggestion-highlighted'));
                }
            })

            parent.textInput.addEventListener('keydown', function (event) {
                if (event.key == parent.KEY_ENTER || (event.key == parent.KEY_TAB && parent.options.enableTabulator)) {
                    event.preventDefault();

                    let highlightedSuggestion = parent.autocomplete.suggestions.querySelector('.token-autocomplete-suggestion-highlighted');

                    if (parent.options.enableTabulator && highlightedSuggestion == null && event.key == parent.KEY_TAB && parent.autocomplete.areSuggestionsDisplayed()) {
                        highlightedSuggestion = parent.autocomplete.suggestions.firstChild;
                    }

                    me.handleInput(highlightedSuggestion);
                }
                if ((event.key == parent.KEY_DOWN || event.key == parent.KEY_UP) && parent.autocomplete.suggestions.childNodes.length > 0) {
                    event.preventDefault();
                }
            });

            if (parent.options.allowCustomEntries) {
                parent.textInput.addEventListener('keyup', function (event) {
                    if (event.key != parent.KEY_ENTER && event.key != parent.KEY_TAB && event.key != parent.KEY_DOWN && event.key != parent.KEY_UP) {
                        event.preventDefault();
                        parent.addHiddenOption(parent.getCurrentInput(), parent.getCurrentInput(), null, true);
                    }
                });
            }

            function focusInput() {
                if (!parent.autocomplete.areSuggestionsDisplayed() && parent.options.showSuggestionsOnFocus) {
                    parent.autocomplete.showSuggestions();
                    parent.autocomplete.loadSuggestions();
                }
                // move the cursor into the editable div
                const selection = window.getSelection();
                const range = document.createRange();
                selection?.removeAllRanges();
                range.selectNodeContents(parent.textInput);
                range.collapse(false);
                selection?.addRange(range);
                parent.textInput.focus();
            }

            parent.textInput.addEventListener('click', function () {
                focusInput();
            });
            me.parent.textInput.addEventListener('focusin', function () {
                focusInput();
            });
            parent.textInput.addEventListener('focusout', function () {
                // Using setTimeout here seems hacky on first sight but ensures proper order of events / handling.
                // We first want to handle a click on a suggestion (when one is made) before hiding the suggestions on focusout of the input.
                // Not doing so could mean the suggestion is hidden before the click is handled und thus resulting in not being selected.
                // This depends on the order in which a browser handles different events and when it sets the active pseudo-selector on clicked events (Firefox for example)
                setTimeout(function () {
                    if (parent.autocomplete.areSuggestionsActive()) {
                        return;
                    }
                    const input = me.parent.getCurrentInput();
                    if (me.parent.val().length !== 0 && me.parent.val()[0] !== '') {
                        return;
                    }
                    if (input != '') {
                        me.handleInputAsValue(input);
                        return;
                    }
                    if (me.previousValue) {
                        me.addToken(me.previousValue, me.previousText, me.previousType, true);
                    }
                }, 0);

            });
            parent.container.querySelector('.token-singleselect-token-delete')?.addEventListener('click', function () {
                me.clear(false, false);
            });
        }

        handleInput(highlightedSuggestion: any): void {
            if (highlightedSuggestion !== null) {
                this.addToken(highlightedSuggestion.dataset.value, highlightedSuggestion.dataset.tokenText, highlightedSuggestion.dataset.type, false);
            } else {
                this.handleInputAsValue(this.parent.getCurrentInput());
            }
            this.parent.autocomplete.clearSuggestions();
            this.parent.autocomplete.hideSuggestions();
        }
    }

    static SearchMultiSelect = class extends TokenAutocomplete.MultiSelect {
        /**
         * Instead of adding the custom user input as a token and handling it as a filter we let it remain in the input
         * area and instead send an event so the user search request can be handled / executed.
         *
         * @param {string} input - the actual input the user entered
         */
        handleInputAsValue(input: string) {
            this.container.dispatchEvent(new CustomEvent('query-changed', {
                detail: {
                    query: input
                }
            }));
        }
    }

    static Autocomplete = class implements Autocomplete {

        parent: TokenAutocomplete;
        container: any;
        options: Options;
        suggestions: HTMLUListElement;
        renderer: SuggestionRenderer;
        request: XMLHttpRequest | null;
        timeout: number | undefined;

        constructor(parent: TokenAutocomplete) {
            this.parent = parent;
            this.container = parent.container;
            this.options = parent.options;
            this.renderer = parent.options.suggestionRenderer;

            this.suggestions = document.createElement('ul');
            this.suggestions.id = this.container.id + '-suggestions';
            this.suggestions.classList.add('token-autocomplete-suggestions');

            this.container.appendChild(this.suggestions);
        }

        initEventListeners() {
            let me = this;
            if (me.parent.options.readonly) {
                return;
            }
            me.parent.textInput.addEventListener('keyup', function (event) {
                if (event.key == me.parent.KEY_ESC) {
                    me.hideSuggestions();
                    me.parent.textInput.blur();
                    return;
                }
                if (event.key == me.parent.KEY_UP && me.suggestions.childNodes.length > 0) {
                    event.preventDefault();
                    let highlightedSuggestion = me.suggestions.querySelector('.token-autocomplete-suggestion-highlighted');
                    if (highlightedSuggestion == null) {
                        // highlight last entry and scroll to bottom
                        me.highlightSuggestionAtPosition(me.suggestions.childNodes.length - 1);
                        me.suggestions.scrollTop = me.suggestions.scrollHeight;
                        return;
                    }
                    let aboveSuggestion = highlightedSuggestion.previousSibling;
                    if (aboveSuggestion != null) {
                        // if the suggestions is above the scroll position, scroll to the suggestion
                        let suggestionTop = (aboveSuggestion as HTMLElement).offsetTop;
                        if (me.suggestions.scrollTop > suggestionTop) {
                            me.suggestions.scrollTop = suggestionTop;
                        }
                        me.highlightSuggestion(aboveSuggestion as Element);
                    } else {
                        highlightedSuggestion.classList.remove('token-autocomplete-suggestion-highlighted');
                    }
                    return;
                }
                if (event.key == me.parent.KEY_DOWN && me.suggestions.childNodes.length > 0) {
                    event.preventDefault();
                    let highlightedSuggestion = me.suggestions.querySelector('.token-autocomplete-suggestion-highlighted');
                    if (highlightedSuggestion == null) {
                        // highlight first entry and scroll to top
                        me.highlightSuggestionAtPosition(0);
                        me.suggestions.scrollTop = 0;
                        return;
                    }
                    let belowSuggestion = highlightedSuggestion?.nextSibling;
                    if (belowSuggestion != null) {
                        // if the suggestions is not completely visible, scroll until the suggestion is at the bottom
                        let suggestionBottom = (belowSuggestion as HTMLElement).offsetTop + (belowSuggestion as HTMLElement).offsetHeight;
                        if (me.suggestions.scrollTop + me.suggestions.clientHeight < suggestionBottom) {
                            me.suggestions.scrollTop = suggestionBottom - me.suggestions.clientHeight;
                        }
                        me.highlightSuggestion(belowSuggestion as Element);
                    } else {
                        highlightedSuggestion.classList.remove('token-autocomplete-suggestion-highlighted');
                    }
                    return;
                }
                if (event.key == me.parent.KEY_LEFT || event.key == me.parent.KEY_RIGHT || event.key == me.parent.KEY_ENTER || event.key == me.parent.KEY_TAB) {
                    // We don't want to re-trigger the autocompletion when the user navigates the cursor inside the input.
                    return;
                }
                me.loadSuggestions();
            });
            me.parent.textInput.addEventListener('focusout', function () {
                // Using setTimeout here seems hacky on first sight but ensures proper order of events / handling.
                // We first want to handle a click on a suggestion (when one is made) before hiding the suggestions on focusout of the input.
                // Not doing so could mean the suggestion is hidden before the click is handled und thus resulting in not being selected.
                // This depends on the order in which a browser handles different events and when it sets the active pseudo-selector on clicked events (Firefox for example)
                setTimeout(function () {
                    if (me.areSuggestionsActive()) {
                        return;
                    }
                    me.hideSuggestions();
                }, 0);
            });
            me.parent.textInput.addEventListener('focusin', function () {
                if (me.options.showSuggestionsOnFocus) {
                    me.loadSuggestions();
                }
            });
        }

        loadSuggestions() {
            let me = this;
            let value = me.parent.getCurrentInput();

            if (me.parent.options.selectMode == SelectModes.SINGLE) {
                if (!me.parent.textInput.isContentEditable) {
                    me.parent.select.clear(true);
                    value = "";
                }
            } else if (value.length < me.parent.options.minCharactersForSuggestion) {
                me.clearSuggestions();
                me.hideSuggestions();
                return;
            }
            if (me.parent.options.suggestionsUri.length > 0) {
                me.requestSuggestions(value);
                return;
            }
            if (Array.isArray(me.parent.options.initialSuggestions)) {
                me.clearSuggestions();
                me.parent.options.initialSuggestions.forEach(function (suggestion) {
                    if (typeof suggestion !== 'object') {
                        // The suggestion is of wrong type and therefore ignored.
                        return;
                    }
                    let text = suggestion.fieldLabel;
                    if (value.length == 0 && me.options.selectMode == SelectModes.SINGLE && !me.options.optional && !me.areSuggestionsDisplayed()) {
                        me.addSuggestion(suggestion, false);
                    } else if (value.localeCompare(text.slice(0, value.length), undefined, {sensitivity: 'base'}) === 0) {
                        // The suggestion starts with the query text the user entered and will be displayed.
                        me.addSuggestion(suggestion);
                    }
                });
                if (me.suggestions.childNodes.length == 0) {
                    if (me.parent.options.allowCustomEntries && me.parent.options.noMatchesCustomEntriesDescription) {
                        me.addSuggestion({
                            id: null,
                            value: value,
                            fieldLabel: value,
                            type: '_no_match_',
                            completionDescription: me.parent.options.noMatchesCustomEntriesDescription,
                            completionLabel: null
                        });

                    } else if (me.parent.options.noMatchesText) {
                        me.addSuggestion({
                            id: null,
                            value: '_no_match_',
                            fieldLabel: me.parent.options.noMatchesText,
                            type: '_no_match_',
                            completionDescription: null,
                            completionLabel: null
                        });
                    }
                }
            }
        }

        /**
         * Hides the suggestions dropdown from the user.
         */
        hideSuggestions() {
            // as the suggestions will be re-shown if a pending request is executed, we abort them if we want to hide
            this.abortPendingRequest();
            this.suggestions.style.display = '';

            let _highlightedSuggestions = this.suggestions.querySelectorAll('li.token-autocomplete-suggestion-highlighted');
            _highlightedSuggestions.forEach(function (_suggestion) {
                _suggestion.classList.remove('token-autocomplete-suggestion-highlighted');
            })
        }

        /**
         * Shows the suggestions dropdown to the user.
         */
        showSuggestions() {
            this.suggestions.style.display = 'block';
        }

        areSuggestionsDisplayed() {
            return this.suggestions.style.display === 'block';
        }

        highlightSuggestionAtPosition(index: number) {
            let _suggestions = this.suggestions.querySelectorAll('li');
            _suggestions.forEach(function (_suggestion) {
                _suggestion.classList.remove('token-autocomplete-suggestion-highlighted');
            })
            _suggestions[index].classList.add('token-autocomplete-suggestion-highlighted');
        }

        highlightSuggestion(_suggestion: Element) {
            this.suggestions.querySelectorAll('li.token-autocomplete-suggestion-highlighted').forEach(function (_highlightedSuggestion) {
                _highlightedSuggestion.classList.remove('token-autocomplete-suggestion-highlighted');
            })
            _suggestion.classList.add('token-autocomplete-suggestion-highlighted');
        }

        /**
         * Checks for the presence of a suggestion that is currently clicked via mouse (active).
         */
        areSuggestionsActive() {
            return !!this.suggestions.querySelector('li:active');
        }

        /**
         * Removes all previous suggestions from the dropdown.
         */
        clearSuggestions() {
            this.abortPendingRequest();
            this.suggestions.innerHTML = '';
        }

        /**
         * Aborts currently in progress or scheduled suggestions requests.
         */
        abortPendingRequest() {
            this.request?.abort();
            clearTimeout(this.timeout);
        }

        /**
         * Loads suggestions matching the given query from the rest service behind the URI given as an option while initializing the field.
         *
         * @param query the query to search suggestions for
         */
        requestSuggestions(query: string) {
            let me = this;
            clearTimeout(me.timeout);
            if (!me.timeout) {
                me.debouncedRequestSuggestions.call(me, query);
                me.timeout = window.setTimeout(function () {
                    delete me.timeout;
                }, me.parent.options.requestDelay);
            } else {
                me.timeout = window.setTimeout(function () {
                    delete me.timeout;
                    me.debouncedRequestSuggestions.call(me, query);
                }, me.parent.options.requestDelay);
            }
        }


        debouncedRequestSuggestions(query: string) {
            let me = this;

            if (me.request != null && me.request.readyState) {
                me.request.abort();
            }

            me.request = new XMLHttpRequest();
            me.request.onload = function () {
                me.request = null;

                me.clearSuggestions();

                let answer = this.response;
                // IE 11 doesn't properly respect content type header, need to parse json string by hand.
                if (typeof answer === 'string') {
                    answer = JSON.parse(answer);
                }

                if (Array.isArray(answer.completions)) {
                    if (me.parent.val().length == 0 && answer.completions.length > 0 && me.options.selectMode == SelectModes.SINGLE && !me.options.optional && !me.areSuggestionsDisplayed()) {
                        answer.completions.forEach(function (suggestion: Suggestion) {
                            me.addSuggestion(suggestion, false);
                        });
                        let firstSuggestion = answer.completions[0] as Suggestion;
                        let value = firstSuggestion.id || firstSuggestion.value;
                        me.parent.select.addToken(value, firstSuggestion.fieldLabel, firstSuggestion.type, true);
                        return;
                    }
                    answer.completions.forEach(function (suggestion: Suggestion) {
                        me.addSuggestion(suggestion);
                    });
                    if (me.suggestions.childNodes.length == 0) {
                        if (me.parent.options.allowCustomEntries && me.parent.options.noMatchesCustomEntriesDescription) {
                            me.addSuggestion({
                                id: null,
                                value: query,
                                fieldLabel: query,
                                type: '_no_match_',
                                completionDescription: me.parent.options.noMatchesCustomEntriesDescription,
                                completionLabel: null
                            });

                        } else if (me.parent.options.noMatchesText) {
                            me.addSuggestion({
                                id: null,
                                value: '_no_match_',
                                fieldLabel: me.parent.options.noMatchesText,
                                type: '_no_match_',
                                completionDescription: null,
                                completionLabel: null
                            });
                        }
                    }
                }
            };
            let suggestionsUri = me.options.suggestionsUriBuilder(query);
            me.request.open('GET', suggestionsUri, true);
            me.request.responseType = 'json';
            me.request.setRequestHeader('Content-type', 'application/json');
            me.request.send();
        }

        /**
         * Adds a suggestion with the given text matching the users input to the dropdown.
         *
         * @param {string} suggestion - the metadata of the suggestion that should be added
         * @param showSuggestions - if the suggestions box should be shown, default true
         */
        addSuggestion(suggestion: Suggestion, showSuggestions = true) {
            let element = this.renderer(suggestion);

            let value = suggestion.id || suggestion.value;
            let text = suggestion.completionLabel || suggestion.fieldLabel;

            element.dataset.value = value;
            element.dataset.text = text;
            element.dataset.tokenText = suggestion.fieldLabel;
            if (suggestion.type != null) {
                element.dataset.type = suggestion.type;
            }

            let me = this;
            element.addEventListener('click', function (_event: Event) {
                if (value == '_no_match_') {
                    return;
                }
                if (me.parent.options.selectMode == SelectModes.SINGLE) {
                    if (element.classList.contains('token-autocomplete-suggestion-active')) {
                        me.parent.select.clear(false);
                    } else {
                        me.parent.select.addToken(value, suggestion.fieldLabel, suggestion.type, false);
                    }
                } else {
                    me.parent.select.clearCurrentInput();
                    if (element.classList.contains('token-autocomplete-suggestion-active')) {
                        let multiSelect = me.parent.select as MultiSelect;
                        multiSelect.removeTokenWithText(suggestion.fieldLabel);
                    } else {
                        me.parent.select.addToken(value, suggestion.fieldLabel, suggestion.type, false);
                    }
                }
                me.clearSuggestions();
                me.hideSuggestions();
            });

            if (this.container.querySelector('.token-autocomplete-token[data-value="' + value + '"]') !== null) {
                element.classList.add('token-autocomplete-suggestion-active');
            }

            this.suggestions.appendChild(element);
            if (showSuggestions) {
                this.showSuggestions();
            }

            me.parent.log('added suggestion', suggestion);
        }

        static defaultRenderer: SuggestionRenderer = function (suggestion: Suggestion): HTMLElement {
            let option = document.createElement('li');
            option.textContent = suggestion.completionLabel || suggestion.fieldLabel;

            if (suggestion.completionDescription) {
                let description = document.createElement('small');
                description.textContent = suggestion.completionDescription;
                description.classList.add('token-autocomplete-suggestion-description');
                option.appendChild(description);
            }

            return option;
        }
    }

    static escapeQuotes(text: string | null | undefined): string {
        return text?.replace(/\x22/g, '\\\x22') ?? '';
    }
}
