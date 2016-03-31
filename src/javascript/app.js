Ext.define("WorkspaceActivityApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'display_box', layout: 'hbox'}
    ],


    integrationHeaders : {
        name : "WorkspaceActivityApp"
    },
    supportedTypeDefinitions: {
        hierarchicalrequirement: {
            TypePath: 'hierarchicalrequirement',
            Name: "User Story",
            DateField: 'LastUpdateDate'
        },
        defect: {
            TypePath: 'defect',
            Name: "Defect",
            DateField: 'LastUpdateDate'
        },
        testcase: {
            TypePath: 'testcase',
            Name: "Test Case",
            DateField: 'LastUpdateDate'
        },
        task: {
            TypePath: 'task',
            Name: "Task",
            DateField: 'LastUpdateDate'
        },
        portfolioitem: {
            TypePath: 'portfolioitem',
            Name: "Portfolio Item",
            DateField: 'LastUpdateDate'
        },
        testcaseresult: {
            TypePath: 'testcaseresult',
            Name: 'Test Case Result',
            DateField: 'Date'
        }
    },
    daysBackDefault: 60,

    launch: function() {

        this.selectedWorkspaces = [this.getContext().getWorkspace()];

        Rally.technicalservices.WsapiToolbox.fetchWorkspaces().then({
            success: function(results){
                this.workspaces = results;
                this.logger.log('fetchArtifactTypes: ', this.supportedTypeDefinitions);
                this._addSelectors();
            },
            failure: function(msg){
                Rally.ui.notify.Notifier.showError({message: msg});
            },
            scope: this
        });

    },
    _addSelectors: function(){
        this.down('#display_box').removeAll();

        var buttonWidth = 150;

        var selectorCt = this.down('#display_box').add({
            xtype: 'container',
            itemId: 'selector-ct',
            layout: 'vbox',
            flex: 1,
            padding: 5
        });

        selectorCt.add({
            xtype: 'rallybutton',
            text: 'Select Workspaces...',
            width: buttonWidth,
            cls: 'secondary',
            listeners: {
                click: this._selectWorkspaces,
                scope: this
            },
            margin: 10
        });


        selectorCt.add({
            xtype: 'rallynumberfield',
            itemId: 'nb-days',
            fieldLabel: 'Days to Lookback',
            labelAlign: 'right',
            labelStyle: "font-family: ProximaNovaSemiBold,Helvetica,Arial;font-weight: normal;text-transform:uppercase;font-size: 12px;",
            value: this.daysBackDefault,
            minValue: 0,
            labelAlign: 'top',
            margin: 10
        });

        var supportedTypeDefinitions = this.supportedTypeDefinitions,
            artifactOptions = _.map(_.keys(supportedTypeDefinitions), function(key){
                return { boxLabel: supportedTypeDefinitions[key].Name, name: 'selectedTypes', inputValue: supportedTypeDefinitions[key].TypePath, checked: true };
        });

        selectorCt.add({
            xtype: 'checkboxgroup',
            fieldLabel: 'Artifact Types',
            itemId: 'chk-selected-types',
            labelAlign: 'right',
            labelStyle: "font-family: ProximaNovaSemiBold,Helvetica,Arial;font-weight: normal;text-transform:uppercase;font-size: 12px;",
            columns: 1,
            vertical: true,
            margin: 10,
            labelAlign: 'top',
            items: artifactOptions
        });

        selectorCt.add({
            xtype: 'rallybutton',
            text: 'Update',
            width: buttonWidth,
            cls: 'primary',
            listeners: {
                click: this._update,
                scope: this
            },
            margin: '20 10 10 10'
        });
        this.down('#display_box').add({
            xtype: 'container',
            itemId: 'grid_box',
            tpl: '<tpl>{message}</tpl>',
            flex: 3
        });
    },

    _update: function(){
        var daysBack = this.down('#nb-days') && this.down('#nb-days').getValue(),
            selectedTypes = this.down('#chk-selected-types') && this.down('#chk-selected-types').getValue() && this.down('#chk-selected-types').getValue().selectedTypes || [],
            selectedContexts = this._getSelectedContexts();

        this.logger.log('_update', daysBack, selectedTypes);

        this.down('#grid_box').removeAll();
        this.down('#grid_box').update({message: ""});

        if (selectedTypes.length > 0 && selectedContexts.length > 0){
            if (!Ext.isArray(selectedTypes)){
                selectedTypes = [selectedTypes];
            }
            this._fetchData(daysBack, selectedTypes, selectedContexts);
        } else {
            this.down('#grid_box').update({message: 'Please select at least 1 Artifact Type, Days Back > 0, and at least 1 selected Context (Workspace and/or Project)'});
        }
    },
    _fetchData: function(daysBack, selectedTypes, selectedContexts){
        this.logger.log('_fetchData', daysBack, selectedTypes, selectedContexts);
        var filters = [],
            me = this,
            promises = [];

        this.setLoading(true);
        this.workspacesLoaded = 0;
        this.workspacesTotal = selectedContexts.length;

        Ext.Array.each(selectedContexts, function(context){
            promises.push(function(){return me._fetchContextCount(context, selectedTypes, daysBack)});
        }, this);

        Deft.Chain.sequence(promises).then({
            success: function(results){
                this.logger.log('Promises success', results.length, results);
                this._addGrid(_.flatten(results));
                this.setLoading(false);
            },
            failure: function(msg){
                this.logger.log('Promises failure', msg);
                Rally.ui.notify.Notifier.showError({message: 'Error fetching counts:  ' + msg});
                this.setLoading(false);
            },
            scope: this
        });

    },
    _selectWorkspaces: function(){
        this.logger.log('_selectWorkspaces', this.workspaces);
        Ext.create('Rally.technicalservices.dialog.PickerDialog',{
            records: this.workspaces,
            selectedRecords: this.selectedWorkspaces,
            displayField: 'Name',
            listeners: {
                scope: this,
                itemselected: this._workspacesSelected
            }
        });
    },
    _workspacesSelected: function(records){
        this.logger.log('_workspacesSelected', records);
         if (records.length > 0){
            this.selectedWorkspaces = records;
        } else {
            this.selectedWorkspaces = [this.getContext().getWorkspace()];
        }
    },

    _addGrid: function(data){


        var fields = _.keys(data[0]),
            store = Ext.create('Rally.data.custom.Store',{
            fields: fields,
            data: data,
            pageSize: data.length
        }),
            pageSize = data.length;
        this.logger.log('_addGrid', data, fields, pageSize);

        this.down('#grid_box').add({
            xtype: 'rallygrid',
            store: store,
            columnCfgs: this._getColumnCfgs(),
            pageSize: pageSize,
            showPagingToolbar: false
        });
    },
    _getColumnCfgs: function(){
        return [{
            dataIndex: 'workspace',
            text: 'Workspace',
            flex: 2
        },{
        //    dataIndex: 'project',
        //    text: 'Project',
        //    flex: 2
        //},{
            dataIndex: 'artifactType',
            text: 'Type',
            flex: 1
        },{
            dataIndex: 'count',
            text: 'Count'
        }];
    },
    _fetchContextCount: function(context, selectedTypes, daysBack){
        var promises = [],
            deferred = Ext.create('Deft.Deferred');

        var daysBackDate = null,
            supportedTypeDefs = this.supportedTypeDefinitions;
        if (daysBack > 0){
            daysBackDate = Rally.util.DateTime.toIsoString(Rally.util.DateTime.add(new Date(), 'day', -daysBack));
        }

        Ext.Array.each(selectedTypes, function(artifactType){
            var filters = [];
            if (daysBackDate){
                filters.push({
                    property: supportedTypeDefs[artifactType].DateField,
                    operator: '>=',
                    value: daysBackDate
                });
            }

            var config = {
                model: artifactType,
                context: context,
                filters: filters
            }

            promises.push(function(){return Rally.technicalservices.WsapiToolbox.fetchWsapiCount(config)});
        });

        Rally.technicalservices.promise.ParallelThrottle.throttle(promises, selectedTypes.length).then({
            success: function(results){
                this.incrementWorkspacesLoaded();

                var data = [];
                for(var i=0; i<results.length; i++){
                    var artifactName = supportedTypeDefs[selectedTypes[i]].Name;
                    data.push({
                        workspace: context.workspaceName,
                        project: context.projectName,
                        artifactType: artifactName,
                        count: results[i],
                        error: null
                    });
                }
                deferred.resolve(data);
            },
            failure: function(message){
                this.incrementWorkspacesLoaded();

                deferred.resolve([{
                    workspace: context.workspaceName,
                    project: context.projectName,
                    artifactType: null,
                    count: null,
                    error: message
                }]);
            },
            scope: this
        });

        return deferred;
    },
    incrementWorkspacesLoaded: function(){
        this.logger.log('incrementWorkspacesLoaded');
        this.setLoading(Ext.String.format("Loading {0} of {1} Workspaces", this.workspacesLoaded, this.workspacesTotal));
        this.workspacesLoaded++;
    },
    _buildCustomStore: function(selectedTypes, selectedContexts, results){
        this.logger.log('_buildCustomStore', selectedTypes, selectedContexts, results);
    },
    _getSelectedContexts: function(){
        this.logger.log('_getSelectedContexts');

        return _.map(this.selectedWorkspaces, function(wksp){

            return {
                workspace: wksp._ref || wksp.get('_ref'),
                project: null,
                workspaceName: wksp.Name || wksp.get('Name'),
                projectName: null
            };
        });
    },
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        // Ext.apply(this, settings);
        this.launch();
    }
});
