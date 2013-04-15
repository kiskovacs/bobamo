define(['Backbone', 'Backbone.Form/form-model',
    'libs/bobamo/edit',
    'libs/util/inflection',
    'libs/renderer/renderers',
    'libs/jquery/jqtpl',
    'backbone-modal',
    'text!modeleditor/views/templates/admin/form-edit.html',
    'libs/jquery/jquery.busy', //added to $
    'libs/editors/reorder-list-editor', //added to Form.editors
    'libs/editors/dyna-nested-model-editor'

], function (B, Form, EditView, inflection, Renderer, jqtpl, modal, template) {
    "use strict";
    var pslice = Array.prototype.slice;
    Form.editors.Blank = Form.editors.Text.extend({
        tagName: 'div',
        setValue: function (val) {
            this.value = val;
        },
        getValue: function () {
            return this.value;
        }

    })
    var NestedModel = Form.editors.NestedModel;

    var schema = {
        isWizzard: {
            type: 'Checkbox',
            help: 'Do you want a wizard?'
        },
        fieldsets: {
            title: 'Fieldsets',
            type: 'ReorderList',
            itemType: 'NestedModel',
            model: B.Model.extend({
                toString: function () {
                    var fields = this.get('fields') || [];
                    return  '<div><h3>' + this.get('legend') + '</h3>' +
                        '<em>fields: </em><small>' + (fields.map(function (v) {
                        return v.property
                    }).join(', '));
                    +'</small></div>'
                },
                schema: {
                    legend: {type: 'Text'},
                    fields: {
                        type: 'ReorderList',
                        itemType: 'NestedModel',
                        listItemTemplate: 'listItemReorder',
                        idAttribute: 'property',
                        model: B.Model.extend({
                            toString: function () {
                                return this.get('property');
                            },
                            renderConfig: function () {
                                var val = this.form.getValue();
                                var editor = val.type || this.get('type');
                                var form = this.form;
                                require(['json-data!modeleditor/admin/editor/' + editor], function (editorConf) {
                                    var schema = editorConf && editorConf.payload && editorConf.payload.schema || {

                                        type: 'Blank',
                                        help: '<div>No Configuration for "' + editor + '"</div>'
                                    };
                                    var fields = form.fields, config = fields.config;
                                    var $el = config.editor.$el;
                                    config.editor.remove();
                                    var data = form.getValue().config;
                                    var configModel = new Form.editors.Object({schema:{subSchema: schema}, value: data, key: config.key, idPrefix: editor}).render();
                                    $el.replaceWith(configModel.el);
                                    config.editor = configModel;

                                });
                            },

                            createForm: function (opts) {
                                var form = this.form = new Form(opts);
                                form.on('render', this.renderConfig, this);
                                form.on('type:change', this.renderConfig, this);
                                return form;
                            },
                            schema: {
                                title: {
                                    type: 'Text'
                                },
                                property: {
                                    type: 'Text'
                                },
                                config: {
                                    type: 'Blank',
                                    fieldClass: 'form-vertical'
                                },
                                type: {
                                    type: 'Select',
                                    url: '${pluginUrl}/admin/editors'
                                }
                            }
                        })
                    }
                }
            }),
            listItemTemplate: 'listItemReorder'
        }
    };
    return EditView.extend({
        model: B.Model.extend({
            schema: schema,
            urlRoot: '${pluginUrl}/admin/model',
            parse: function (resp) {
                resp = resp.payload;
                var schema = resp.schema;
                resp.fieldsets = resp.fieldsets.map(function (v) {
                    v.fields = v.fields.map(function (field) {

                        if (_.isString(field)) {
                            var f = schema[field] || {}
                            if (f) f.property = field;
                            return f || {
                                property: field,
                                title: field,
                                type: 'Text'
                            }
                        } else {
                            if (field)
                                field.property = field.name;
                            return field;
                        }

                    });

                    return v;
                });

                return resp;
            }
        }),
        onPreview: function (e) {
            if (e && e.preventDefault)
                e.preventDefault();
            this.$preview = this.$el.find('.preview-container');
            this.$preview.busy({
                img: 'img/ajax-loader.gif',
                title: 'Previewing...'
            });
            var id = this.modelInstance.id;
            require(['views/' + id + '/edit',
                'text!templates/' + id + '/edit.html.raw'
            ], this.doPreview.bind(this));

        },
        doPreview: function (View, template) {
            if (this.preView)
                this.preView.remove();
            var config = this.createConfig(template);
            var NView = View.extend(config);
            this.$preview.empty();
            var v = this.preView = new NView();
            v.render();

            this.$preview.busy('remove');
            this.$preview.html(v.$el);
        },
        onSuccess: function () {
            EditView.prototype.onSuccess.apply(this, pslice.call(arguments))
            var id = this.modelInstance.id;
            require(['views/' + id + '/edit',
                'text!templates/' + id + '/edit.html.raw'
            ], this.doModify.bind(this));
        },
        doModify: function (View, table, tableItem) {
            _.extend(View.prototype, this.createConfig(table, tableItem));
        },
        createConfig: function (formtemplate) {
            var fieldsets = this.form.getValue().fieldsets;
            var schema = {};
            var fieldset = []
            fieldsets.forEach(function(fset){
                fieldset.push({
                    legend:fset.legend,
                    fields:fset.fields.map(function(v){
                        schema[v.property] =v;
                        return v.property;
                    })
                })
            });
            var obj = {
                model: {
                    pathFor: function (property) {
                        for (var i = 0, l = list.length; i < l; i++) {
                            var itm = list[i];
                            if (itm && itm.property == property)
                                return itm;
                        }
                        return {title: property}

                    }
                }
            };
            return {
                template: _.template(jqtpl.render(formtemplate, obj)),
                fieldsets:fieldset,
                schema:schema
            }
        },

        render: function (obj) {
            EditView.prototype.render.call(this, obj);
            this.form.on('change', this.onPreview, this);
            this.form.on('render', this.onPreview, this);
            return this;
        },
        listUrl: function () {
            return "#${pluginUrl}/views/admin/list"
        },
        createTemplate: _.template('<i class="icon-plus"></i>Create New <%=title%>'),
        editTemplate: _.template('<i class="icon-edit"></i> Edit <%=title%>'),
        fields: ['isWizzard', 'fieldsets'],
        template: _.template(template),
        config: {
            title: 'Form View'
        }
    });
});